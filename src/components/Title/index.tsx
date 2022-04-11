import React from 'react';
import { useHistory } from 'react-router-dom';
import { Flex } from 'rebass';
import styled from 'styled-components';

import Logo from '../../assets/svg/logo_white.svg';
import Wordmark from '../../assets/svg/wordmark_white.svg';
import Link from '../Link';
import { RowFixed } from '../Row';

const TitleWrapper = styled.div`
  text-decoration: none;

  &:hover {
    cursor: pointer;
  }

  z-index: 10;
`;

export default function Title() {
  const history = useHistory();

  return (
    <TitleWrapper onClick={() => history.push('/')}>
      <Flex alignItems="center">
        <RowFixed>
          <Link id="link" onClick={() => history.push('/')}>
            <img width={'20px'} src={Logo} alt="logo" />
          </Link>
          <img width={'72px'} style={{ marginLeft: '8px', marginTop: '0px' }} src={Wordmark} alt="logo" />
        </RowFixed>
      </Flex>
    </TitleWrapper>
  );
}
