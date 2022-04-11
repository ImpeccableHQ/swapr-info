import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMedia } from 'react-use';
import { ResponsiveContainer } from 'recharts';

import { TYPE } from '../../Theme';
import { timeframeOptions } from '../../constants';
import { useGlobalChartData, useGlobalData } from '../../contexts/GlobalData';
import { getTimeframe } from '../../utils';
import { OptionButton } from '../ButtonStyled';
import DropdownSelect from '../DropdownSelect';
import { RowFixed } from '../Row';
import TradingViewChart, { CHART_TYPES } from '../TradingviewChart';

const CHART_VIEW = {
  VOLUME: 'Volume',
  LIQUIDITY: 'Liquidity',
};

const VOLUME_WINDOW = {
  WEEKLY: 'WEEKLY',
  DAYS: 'DAYS',
};
const GlobalChart = ({ display }) => {
  // chart options
  const [chartView, setChartView] = useState(display === 'volume' ? CHART_VIEW.VOLUME : CHART_VIEW.LIQUIDITY);

  // time window and window size for chart
  const timeWindow = timeframeOptions.ALL_TIME;
  const [volumeWindow, setVolumeWindow] = useState(VOLUME_WINDOW.DAYS);

  // global historical data
  const [dailyData, weeklyData] = useGlobalChartData();
  const { totalLiquidityUSD, oneDayVolumeUSD, volumeChangeUSD, liquidityChangeUSD, oneWeekVolume, weeklyVolumeChange } =
    useGlobalData();

  // based on window, get starttim
  const utcStartTime = getTimeframe(timeWindow);

  const chartDataFiltered = useMemo(() => {
    const currentData = volumeWindow === VOLUME_WINDOW.DAYS ? dailyData : weeklyData;
    return (
      currentData &&
      Object.keys(currentData)
        ?.map((key) => {
          const item = currentData[key];
          if (item.date > utcStartTime) {
            return item;
          } else {
            return null;
          }
        })
        .filter((item) => {
          return !!item;
        })
    );
  }, [dailyData, utcStartTime, volumeWindow, weeklyData]);
  const below800 = useMedia('(max-width: 800px)');

  // update the width on a window resize
  const ref = useRef();
  const isClient = typeof window === 'object';
  const [width, setWidth] = useState<number>();

  useEffect(() => {
    function handleResize() {
      if (ref !== undefined && ref.current !== undefined) {
        // @ts-expect-error
        setWidth(ref?.current?.container?.clientWidth ?? width);
      }
    }
    if (isClient) {
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isClient, width]); // Empty array ensures that effect is only run on mount and unmount

  return chartDataFiltered ? (
    <>
      {below800 && (
        <DropdownSelect options={CHART_VIEW} active={chartView} setActive={setChartView} color={'#4526A2'} />
      )}

      {chartDataFiltered && chartView === CHART_VIEW.LIQUIDITY && (
        <ResponsiveContainer aspect={60 / 28} ref={ref}>
          <TradingViewChart
            data={dailyData}
            base={totalLiquidityUSD}
            baseChange={liquidityChangeUSD}
            title="Liquidity"
            field="totalLiquidityUSD"
            width={width}
            type={CHART_TYPES.AREA}
          />
        </ResponsiveContainer>
      )}
      {chartDataFiltered && chartView === CHART_VIEW.VOLUME && (
        <ResponsiveContainer aspect={60 / 28}>
          <TradingViewChart
            data={chartDataFiltered}
            base={volumeWindow === VOLUME_WINDOW.WEEKLY ? oneWeekVolume : oneDayVolumeUSD}
            baseChange={volumeWindow === VOLUME_WINDOW.WEEKLY ? weeklyVolumeChange : volumeChangeUSD}
            title={volumeWindow === VOLUME_WINDOW.WEEKLY ? 'Volume (7d)' : 'Volume'}
            field={volumeWindow === VOLUME_WINDOW.WEEKLY ? 'weeklyVolumeUSD' : 'dailyVolumeUSD'}
            width={width}
            type={CHART_TYPES.BAR}
            useWeekly={volumeWindow === VOLUME_WINDOW.WEEKLY}
          />
        </ResponsiveContainer>
      )}
      {display === 'volume' && (
        <RowFixed
          style={{
            bottom: '70px',
            position: 'absolute',
            left: '20px',
            zIndex: 10,
          }}
        >
          <OptionButton
            active={volumeWindow === VOLUME_WINDOW.DAYS}
            onClick={() => setVolumeWindow(VOLUME_WINDOW.DAYS)}
          >
            <TYPE.body>D</TYPE.body>
          </OptionButton>
          <OptionButton
            style={{ marginLeft: '4px' }}
            active={volumeWindow === VOLUME_WINDOW.WEEKLY}
            onClick={() => setVolumeWindow(VOLUME_WINDOW.WEEKLY)}
          >
            <TYPE.body>W</TYPE.body>
          </OptionButton>
        </RowFixed>
      )}
    </>
  ) : null;
};

export default GlobalChart;
