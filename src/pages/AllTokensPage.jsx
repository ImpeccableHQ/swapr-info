import { useEffect } from 'react';
import 'feather-icons';
import { useMedia } from 'react-use';
import { Flex } from 'rebass';

import { Typography } from '../Theme';
import { PageWrapper, FullWrapper } from '../components';
import Search from '../components/Search';
import TopTokenList from '../components/TokenList';
import { useAllTokenData } from '../contexts/TokenData';

function AllTokensPage() {
  const allTokens = useAllTokenData();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const below600 = useMedia('(max-width: 800px)');

  return (
    <PageWrapper>
      <FullWrapper>
        <Flex alignItems={'flex-end'} justifyContent={'space-between'}>
          <Typography.LargeHeader>Top Tokens</Typography.LargeHeader>
          {!below600 && <Search small={true} />}
        </Flex>
        <TopTokenList tokens={allTokens} itemMax={20} />
      </FullWrapper>
    </PageWrapper>
  );
}

export default AllTokensPage;
