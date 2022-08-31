import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { createContext, useContext, useReducer, useMemo, useCallback, useEffect, useState } from 'react';

import { Interface } from '@ethersproject/abi';
import { getAddress } from '@ethersproject/address';
import { Contract } from '@ethersproject/contracts';
import { parseUnits } from '@ethersproject/units';
import { TokenAmount, Token, Pair, Currency } from '@swapr/sdk';

import multicallAbi from '../abi/multicall.json';
import {
  PAIR_DATA,
  PAIR_CHART,
  FILTERED_TRANSACTIONS,
  PAIRS_CURRENT,
  PAIRS_BULK,
  PAIRS_HISTORICAL_BULK,
  HOURLY_PAIR_RATES,
  liquidityMiningCampaignsQuery,
} from '../apollo/queries';
import {
  CHAIN_READONLY_PROVIDERS,
  ChainIdForSupportedNetwork,
  MULTICALL_ADDRESS,
  timeframeOptions,
} from '../constants';
import {
  getPercentChange,
  get2DayPercentChange,
  isAddress,
  getBlocksFromTimestamps,
  getTimestampsForChanges,
  splitQuery,
  toLiquidityMiningCampaign,
  getStakedAmountUSD,
  getBlocksForTimestamps,
} from '../utils';
import { updateNameData } from '../utils/data';
import { isSyncedBlockAboveThreshold, useLatestBlocks } from './Application';
import { useNativeCurrencyPrice } from './GlobalData';
import { useBlocksSubgraphClient, useSelectedNetwork, useSwaprSubgraphClient } from './Network';

const RESET = 'RESET';
const UPDATE = 'UPDATE';
const UPDATE_PAIR_TXNS = 'UPDATE_PAIR_TXNS';
const UPDATE_CHART_DATA = 'UPDATE_CHART_DATA';
const UPDATE_MINING_DATA = 'UPDATE_MINING_DATA';
const UPDATE_TOP_PAIRS = 'UPDATE_TOP_PAIRS';
const UPDATE_HOURLY_DATA = 'UPDATE_HOURLY_DATA';

export const STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
};

dayjs.extend(utc);

export function safeAccess(object, path) {
  return object
    ? path.reduce(
        (accumulator, currentValue) => (accumulator && accumulator[currentValue] ? accumulator[currentValue] : null),
        object,
      )
    : null;
}

const PairDataContext = createContext();

function usePairDataContext() {
  return useContext(PairDataContext);
}

const INITIAL_STATE = { topPairs: {} };

function reducer(state, { type, payload }) {
  switch (type) {
    case UPDATE: {
      const { pairAddress, data } = payload;
      return {
        ...state,
        [pairAddress]: {
          ...state?.[pairAddress],
          ...data,
        },
      };
    }
    case UPDATE_MINING_DATA: {
      const { status, liquidityMiningData } = payload;

      return {
        ...state,
        [status]: liquidityMiningData,
      };
    }

    case UPDATE_TOP_PAIRS: {
      const { topPairs, network } = payload;
      const newTopPairs = topPairs
        ? topPairs.reduce((reducedPairs, pair) => {
            reducedPairs[pair.id] = pair;
            return reducedPairs;
          }, {})
        : {};
      return {
        ...state,
        topPairs: {
          ...state.topPairs,
          [network]: newTopPairs,
        },
      };
    }

    case UPDATE_PAIR_TXNS: {
      const { address, transactions } = payload;
      return {
        ...state,
        [address]: {
          ...(safeAccess(state, [address]) || {}),
          txns: transactions,
        },
      };
    }
    case UPDATE_CHART_DATA: {
      const { address, chartData } = payload;
      return {
        ...state,
        [address]: {
          ...(safeAccess(state, [address]) || {}),
          chartData,
        },
      };
    }

    case UPDATE_HOURLY_DATA: {
      const { address, data, timeWindow, interval } = payload;
      return {
        ...state,
        [address]: {
          ...state?.[address],
          [timeWindow]: {
            ...state?.[address]?.[timeWindow],
            [interval]: data,
          },
        },
      };
    }

    case RESET: {
      return {
        topPairs: state.topPairs,
      };
    }

    default: {
      throw Error(`Unexpected action type in DataContext reducer: '${type}'.`);
    }
  }
}

export default function Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // update pair specific data
  const update = useCallback((pairAddress, data) => {
    dispatch({
      type: UPDATE,
      payload: {
        pairAddress,
        data,
      },
    });
  }, []);

  const updateTopPairs = useCallback((topPairs, network) => {
    dispatch({
      type: UPDATE_TOP_PAIRS,
      payload: {
        topPairs,
        network,
      },
    });
  }, []);
  const updateMiningData = useCallback((status, liquidityMiningData) => {
    dispatch({
      type: UPDATE_MINING_DATA,
      payload: { status, liquidityMiningData },
    });
  }, []);

  const updatePairTxns = useCallback((address, transactions) => {
    dispatch({
      type: UPDATE_PAIR_TXNS,
      payload: { address, transactions },
    });
  }, []);

  const updateChartData = useCallback((address, chartData) => {
    dispatch({
      type: UPDATE_CHART_DATA,
      payload: { address, chartData },
    });
  }, []);

  const updateHourlyData = useCallback((address, data, timeWindow, interval) => {
    dispatch({
      type: UPDATE_HOURLY_DATA,
      payload: { address, data, timeWindow, interval },
    });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: RESET });
  }, []);

  return (
    <PairDataContext.Provider
      value={useMemo(
        () => [
          state,
          {
            update,
            updateMiningData,
            updatePairTxns,
            updateChartData,
            updateTopPairs,
            updateHourlyData,
            reset,
          },
        ],
        [state, update, updateMiningData, updatePairTxns, updateChartData, updateTopPairs, updateHourlyData, reset],
      )}
    >
      {children}
    </PairDataContext.Provider>
  );
}
const PAIR_INTERFACE = new Interface(['function swapFee() view returns (uint32)']);

async function getPairsSwapFee(selectedNetwork, pairIds) {
  let fees = {};
  try {
    const multicall = new Contract(
      MULTICALL_ADDRESS[selectedNetwork],
      multicallAbi,
      CHAIN_READONLY_PROVIDERS[selectedNetwork],
    );

    const encodedSwapFeeCall = PAIR_INTERFACE.encodeFunctionData('swapFee()');
    const result = await multicall.aggregate(pairIds.map((pairId) => [pairId, encodedSwapFeeCall]));
    if (pairIds.length !== result.returnData.length) throw new Error('inconsistent multicall result length');

    for (let i = 0; i < result.returnData.length; i++) {
      fees[pairIds[i]] = PAIR_INTERFACE.decodeFunctionResult('swapFee()', result.returnData[i])[0];
    }
  } catch (error) {
    console.error('error fetching pair swap fees', error);
  }
  return fees;
}

async function getBulkPairData(client, blockClient, pairList, nativeCurrencyPrice, selectedNetwork, overrideBlocks) {
  const [t1, t2, tWeek] = getTimestampsForChanges();

  let b1, b2, bWeek;

  if (Array.isArray(overrideBlocks) && overrideBlocks.length === 3) {
    [b1, b2, bWeek] = overrideBlocks;
  } else {
    [{ number: b1 }, { number: b2 }, { number: bWeek }] = await getBlocksFromTimestamps(blockClient, [t1, t2, tWeek]);
  }

  try {
    let current = await client.query({
      query: PAIRS_BULK,
      variables: {
        allPairs: pairList,
      },
    });
    const swapFees = await getPairsSwapFee(selectedNetwork, pairList);

    let [oneDayResult, twoDayResult, oneWeekResult] = await Promise.all(
      [b1, b2, bWeek].map(async (block) => {
        let result = client.query({
          query: PAIRS_HISTORICAL_BULK(block, pairList),
        });
        return result;
      }),
    );

    let oneDayData = oneDayResult?.data?.pairs.reduce((obj, cur) => {
      return { ...obj, [cur.id]: cur };
    }, {});

    let twoDayData = twoDayResult?.data?.pairs.reduce((obj, cur) => {
      return { ...obj, [cur.id]: cur };
    }, {});

    let oneWeekData = oneWeekResult?.data?.pairs.reduce((obj, cur) => {
      return { ...obj, [cur.id]: cur };
    }, {});

    let pairData = await Promise.all(
      current &&
        current.data.pairs.map(async (pair) => {
          let data = pair;
          let oneDayHistory = oneDayData?.[pair.id];
          if (!oneDayHistory) {
            let newData = await client.query({
              query: PAIR_DATA(pair.id, b1),
            });
            oneDayHistory = newData.data.pairs[0];
          }
          let twoDayHistory = twoDayData?.[pair.id];
          if (!twoDayHistory) {
            let newData = await client.query({
              query: PAIR_DATA(pair.id, b2),
            });
            twoDayHistory = newData.data.pairs[0];
          }
          let oneWeekHistory = oneWeekData?.[pair.id];
          if (!oneWeekHistory) {
            let newData = await client.query({
              query: PAIR_DATA(pair.id, bWeek),
            });
            oneWeekHistory = newData.data.pairs[0];
          }
          data = parseData(data, oneDayHistory, twoDayHistory, oneWeekHistory, nativeCurrencyPrice, b1);
          data.swapFee = swapFees[pair.id] || 25; // 25 bips is the default swap fee, fallback to it
          return data;
        }),
    );
    return pairData;
  } catch (e) {
    console.log(e);
  }
}

function parseData(data, oneDayData, twoDayData, oneWeekData, nativeCurrencyPrice, oneDayBlock) {
  // get volume changes
  const [oneDayVolumeUSD, volumeChangeUSD] = get2DayPercentChange(
    data?.volumeUSD,
    oneDayData?.volumeUSD ? oneDayData.volumeUSD : 0,
    twoDayData?.volumeUSD ? twoDayData.volumeUSD : 0,
  );
  const [oneDayVolumeUntracked, volumeChangeUntracked] = get2DayPercentChange(
    data?.untrackedVolumeUSD,
    oneDayData?.untrackedVolumeUSD ? parseFloat(oneDayData?.untrackedVolumeUSD) : 0,
    twoDayData?.untrackedVolumeUSD ? twoDayData?.untrackedVolumeUSD : 0,
  );
  const oneWeekVolumeUSD = parseFloat(oneWeekData ? data?.volumeUSD - oneWeekData?.volumeUSD : data.volumeUSD);

  // set volume properties
  data.oneDayVolumeUSD = parseFloat(oneDayVolumeUSD);
  data.oneWeekVolumeUSD = oneWeekVolumeUSD;
  data.volumeChangeUSD = volumeChangeUSD;
  data.oneDayVolumeUntracked = oneDayVolumeUntracked;
  data.volumeChangeUntracked = volumeChangeUntracked;

  // set liquiditry properties
  data.trackedReserveUSD = data.trackedReserveNativeCurrency * nativeCurrencyPrice;
  data.liquidityChangeUSD = getPercentChange(data.reserveUSD, oneDayData?.reserveUSD);

  // format if pair hasnt existed for a day or a week
  if (!oneDayData && data && data.createdAtBlockNumber > oneDayBlock) {
    data.oneDayVolumeUSD = parseFloat(data.volumeUSD);
  }
  if (!oneDayData && data) {
    data.oneDayVolumeUSD = parseFloat(data.volumeUSD);
  }
  if (!oneWeekData && data) {
    data.oneWeekVolumeUSD = parseFloat(data.volumeUSD);
  }

  // format incorrect names
  updateNameData(data);

  return data;
}

const getPairTransactions = async (client, pairAddress) => {
  const transactions = {};

  try {
    let result = await client.query({
      query: FILTERED_TRANSACTIONS,
      variables: {
        allPairs: [pairAddress],
      },
    });
    transactions.mints = result.data.mints;
    transactions.burns = result.data.burns;
    transactions.swaps = result.data.swaps;
  } catch (e) {
    console.log(e);
  }

  return transactions;
};

const getPairChartData = async (client, pairAddress) => {
  let data = [];
  const utcEndTime = dayjs.utc();
  let utcStartTime = utcEndTime.subtract(1, 'year').startOf('minute');
  let startTime = utcStartTime.unix() - 1;

  try {
    let allFound = false;
    let skip = 0;
    while (!allFound) {
      let result = await client.query({
        query: PAIR_CHART,
        variables: {
          pairAddress: pairAddress,
          skip,
        },
      });
      skip += 1000;
      data = data.concat(result.data.pairDayDatas);
      if (result.data.pairDayDatas.length < 1000) {
        allFound = true;
      }
    }

    let dayIndexSet = new Set();
    let dayIndexArray = [];
    const oneDay = 24 * 60 * 60;
    data.forEach((dayData, i) => {
      // add the day index to the set of days
      dayIndexSet.add((data[i].date / oneDay).toFixed(0));
      dayIndexArray.push(data[i]);
      dayData.dailyVolumeUSD = parseFloat(dayData.dailyVolumeUSD);
      dayData.reserveUSD = parseFloat(dayData.reserveUSD);
      dayData.utilization =
        parseFloat(dayData.reserveUSD === 0 ? 0 : dayData.dailyVolumeUSD / dayData.reserveUSD) * 100;
    });

    if (data[0]) {
      // fill in empty days
      let timestamp = data[0].date ? data[0].date : startTime;
      let latestLiquidityUSD = data[0].reserveUSD;
      let index = 1;
      while (timestamp < utcEndTime.unix() - oneDay) {
        const nextDay = timestamp + oneDay;
        let currentDayIndex = (nextDay / oneDay).toFixed(0);
        if (!dayIndexSet.has(currentDayIndex)) {
          data.push({
            date: nextDay,
            dayString: nextDay,
            dailyVolumeUSD: 0,
            reserveUSD: latestLiquidityUSD,
            utilization: 0,
          });
        } else {
          latestLiquidityUSD = dayIndexArray[index].reserveUSD;
          index = index + 1;
        }
        timestamp = nextDay;
      }
    }

    data = data.sort((a, b) => (parseInt(a.date) > parseInt(b.date) ? 1 : -1));
  } catch (e) {
    console.error(e);
  }

  return data;
};

const getPairRateData = async (client, blockClient, pairAddress, startTime, interval = 3600, latestBlock) => {
  try {
    const utcEndTime = dayjs.utc();
    let time = startTime;

    // create an array of hour start times until we reach current hour
    const timestamps = [];
    while (time <= utcEndTime.unix()) {
      timestamps.push(time);
      time += interval;
    }

    // backout if invalid timestamp format
    if (timestamps.length === 0) {
      return [];
    }

    // once you have all the timestamps, get the blocks for each timestamp in a bulk query
    let blocks;

    blocks = await getBlocksForTimestamps(blockClient, timestamps);

    // catch failing case
    if (!blocks || blocks?.length === 0) {
      return [];
    }

    if (latestBlock) {
      blocks = blocks.filter((b) => {
        return parseFloat(b.number) <= parseFloat(latestBlock);
      });
    }

    const result = await splitQuery(HOURLY_PAIR_RATES, client, [pairAddress], blocks, 100);

    // format token native currency price results
    let values = [];
    for (var row in result) {
      let timestamp = row.split('t')[1];
      if (timestamp) {
        values.push({
          timestamp,
          rate0: parseFloat(result[row]?.token0Price),
          rate1: parseFloat(result[row]?.token1Price),
        });
      }
    }

    let formattedHistoryRate0 = [];
    let formattedHistoryRate1 = [];

    // for each hour, construct the open and close price
    for (let i = 0; i < values.length - 1; i++) {
      formattedHistoryRate0.push({
        timestamp: values[i].timestamp,
        open: parseFloat(values[i].rate0),
        close: parseFloat(values[i + 1].rate0),
      });
      formattedHistoryRate1.push({
        timestamp: values[i].timestamp,
        open: parseFloat(values[i].rate1),
        close: parseFloat(values[i + 1].rate1),
      });
    }

    return [formattedHistoryRate0, formattedHistoryRate1];
  } catch (e) {
    console.log(e);
    return [[], []];
  }
};

export function Updater() {
  const client = useSwaprSubgraphClient();
  const network = useSelectedNetwork();
  const selectedNetwork = useSelectedNetwork();
  const blockClient = useBlocksSubgraphClient();
  const [, { updateTopPairs }] = usePairDataContext();
  const [nativeCurrencyPrice] = useNativeCurrencyPrice();
  const [latestSyncedBlock, headBlock] = useLatestBlocks();

  useEffect(() => {
    async function getData() {
      // get top pairs by reserves
      let {
        data: { pairs },
      } = await client.query({
        query: PAIRS_CURRENT,
      });

      // format as array of addresses
      const formattedPairs = pairs.map((pair) => {
        return pair.id;
      });

      const overrideBlocks = isSyncedBlockAboveThreshold(latestSyncedBlock, headBlock, selectedNetwork)
        ? [latestSyncedBlock, latestSyncedBlock, latestSyncedBlock]
        : undefined;

      // get data for every pair in list
      let topPairs = await getBulkPairData(
        client,
        blockClient,
        formattedPairs,
        nativeCurrencyPrice,
        selectedNetwork,
        overrideBlocks,
      );
      topPairs && updateTopPairs(topPairs, network);
    }
    nativeCurrencyPrice && getData();
  }, [
    nativeCurrencyPrice,
    updateTopPairs,
    client,
    blockClient,
    selectedNetwork,
    latestSyncedBlock,
    headBlock,
    network,
  ]);
  return null;
}

export function usePairRateData(pairAddress, timeWindow, interval = 3600) {
  const client = useSwaprSubgraphClient();
  const blockClient = useBlocksSubgraphClient();
  const [state, { updateHourlyData }] = usePairDataContext();
  const chartData = state?.[pairAddress]?.[timeWindow]?.[interval];
  const [latestBlock] = useLatestBlocks();

  useEffect(() => {
    const currentTime = dayjs.utc();
    const windowSize = timeWindow === timeframeOptions.WEEK ? 'week' : 'year';

    const startTime = currentTime.subtract(1, windowSize).startOf('hour').unix();

    async function fetch() {
      let data = await getPairRateData(client, blockClient, pairAddress, startTime, interval, latestBlock);
      updateHourlyData(pairAddress, data, timeWindow, interval);
    }
    if (!chartData) {
      fetch();
    }
  }, [chartData, timeWindow, pairAddress, updateHourlyData, latestBlock, client, blockClient, interval]);

  return chartData;
}

/**
 * @todo
 * store these updates to reduce future redundant calls
 */
export function useDataForList(pairList) {
  const selectedNetwork = useSelectedNetwork();
  const client = useSwaprSubgraphClient();
  const blockClient = useBlocksSubgraphClient();
  const [state] = usePairDataContext();
  const [nativeCurrencyPrice] = useNativeCurrencyPrice();

  const [stale, setStale] = useState(false);
  const [fetched, setFetched] = useState([]);

  // reset
  useEffect(() => {
    if (pairList) {
      setStale(false);
      setFetched();
    }
  }, [pairList]);

  useEffect(() => {
    async function fetchNewPairData() {
      let newFetched = [];
      let unfetched = [];

      pairList.map(async (pair) => {
        let currentData = state?.[pair.id];
        if (!currentData) {
          unfetched.push(pair.id);
        } else {
          newFetched.push(currentData);
        }
      });

      let newPairData = await getBulkPairData(
        client,
        blockClient,
        unfetched.map((pair) => {
          return pair;
        }),
        nativeCurrencyPrice,
        selectedNetwork,
      );
      setFetched(newFetched.concat(newPairData));
    }
    if (nativeCurrencyPrice && pairList && pairList.length > 0 && !fetched && !stale) {
      setStale(true);
      fetchNewPairData();
    }
  }, [nativeCurrencyPrice, state, pairList, stale, fetched, client, blockClient, selectedNetwork]);

  let formattedFetch =
    fetched &&
    fetched.reduce((obj, cur) => {
      return { ...obj, [cur?.id]: cur };
    }, {});

  return formattedFetch;
}

/**
 * Get all the current and 24hr changes for a pair
 */
export function usePairData(pairAddress) {
  const client = useSwaprSubgraphClient();
  const selectedNetwork = useSelectedNetwork();
  const blockClient = useBlocksSubgraphClient();
  const [state, { update }] = usePairDataContext();
  const [nativeCurrencyPrice] = useNativeCurrencyPrice();
  const pairData = state?.[pairAddress];

  useEffect(() => {
    async function fetchData() {
      if ((!pairData || !pairData.id) && pairAddress && isAddress(pairAddress)) {
        let data = await getBulkPairData(client, blockClient, [pairAddress], nativeCurrencyPrice, selectedNetwork);
        data && update(pairAddress, data[0]);
      }
    }
    if ((!pairData || !pairData.id) && pairAddress && nativeCurrencyPrice && isAddress(pairAddress)) {
      fetchData();
    }
  }, [pairAddress, pairData, update, nativeCurrencyPrice, client, blockClient, selectedNetwork]);

  return pairData || {};
}

/**
 * Get most recent txns for a pair
 */
export function usePairTransactions(pairAddress) {
  const client = useSwaprSubgraphClient();
  const [state, { updatePairTxns }] = usePairDataContext();
  const pairTxns = state?.[pairAddress]?.txns;
  useEffect(() => {
    async function checkForTxns() {
      if (!pairTxns) {
        let transactions = await getPairTransactions(client, pairAddress);
        updatePairTxns(pairAddress, transactions);
      }
    }
    checkForTxns();
  }, [pairTxns, pairAddress, updatePairTxns, client]);
  return pairTxns;
}

export function useLiquidityMiningCampaignData() {
  const client = useSwaprSubgraphClient();
  const selectedNetwork = useSelectedNetwork();
  const [state, { updateMiningData }] = usePairDataContext();
  const [nativeCurrencyUSDPrice] = useNativeCurrencyPrice();
  let miningData = {};
  Object.keys(STATUS).forEach((key) => (miningData[STATUS[key]] = state?.[STATUS[key]]));

  useEffect(() => {
    async function fetchData(status) {
      if (miningData[status] === undefined && nativeCurrencyUSDPrice !== undefined) {
        const time = dayjs.utc().unix();
        let {
          data: { liquidityMiningCampaigns },
        } = await client.query({
          query: liquidityMiningCampaignsQuery(status, time),
        });
        const arrayWithMiningCampaignObject = [];
        liquidityMiningCampaigns &&
          liquidityMiningCampaigns.forEach((pair) => {
            const pairData = pair.stakablePair;

            const nativeCurrency = Currency.getNative(ChainIdForSupportedNetwork[selectedNetwork]);

            const tokenA = new Token(
              ChainIdForSupportedNetwork[selectedNetwork],
              getAddress(pairData.token0.id),
              parseInt(pairData.token0.decimals),
              pairData.token0.symbol,
              pairData.token0.name,
            );
            const tokenB = new Token(
              ChainIdForSupportedNetwork[selectedNetwork],
              getAddress(pairData.token1.id),
              parseInt(pairData.token1.decimals),
              pairData.token1.symbol,
              pairData.token1.name,
            );
            const tokenAmountA = new TokenAmount(
              tokenA,
              parseUnits(pairData.reserve0, pairData.token0.decimals).toString(),
            );
            const tokenAmountB = new TokenAmount(
              tokenB,
              parseUnits(pairData.reserve1, pairData.token1.decimals).toString(),
            );
            const final = new Pair(tokenAmountA, tokenAmountB);

            let miningCampaignObject = toLiquidityMiningCampaign(
              ChainIdForSupportedNetwork[selectedNetwork],
              final,
              pairData.totalSupply,
              pairData.reserveNativeCurrency,
              pair,
              nativeCurrency,
            );

            const stakedPriceInUsd = getStakedAmountUSD(miningCampaignObject, nativeCurrencyUSDPrice, nativeCurrency);

            arrayWithMiningCampaignObject.push({
              ...pair,
              miningCampaignObject,
              stakedPriceInUsd: stakedPriceInUsd?.toFixed(2),
            });
          });

        liquidityMiningCampaigns && updateMiningData(status, arrayWithMiningCampaignObject);
      }
    }

    Object.keys(STATUS).forEach((key) => fetchData(STATUS[key]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, selectedNetwork, updateMiningData, nativeCurrencyUSDPrice]);

  return miningData;
}

export function usePairChartData(pairAddress) {
  const client = useSwaprSubgraphClient();
  const [state, { updateChartData }] = usePairDataContext();
  const chartData = state?.[pairAddress]?.chartData;

  useEffect(() => {
    async function checkForChartData() {
      if (!chartData) {
        let data = await getPairChartData(client, pairAddress);
        updateChartData(pairAddress, data);
      }
    }
    checkForChartData();
  }, [chartData, pairAddress, updateChartData, client]);

  return chartData;
}

/**
 * Get list of all pairs in Swapr
 */
export function useAllPairData() {
  const network = useSelectedNetwork();
  const [state] = usePairDataContext();

  return state.topPairs[network] || [];
}

export function usePairContextResetter() {
  const [, { reset }] = usePairDataContext();
  return reset;
}
