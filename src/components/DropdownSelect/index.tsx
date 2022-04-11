import React, { useRef, useState } from 'react';
import { ChevronDown as Arrow } from 'react-feather';
import { useClickAway } from 'react-use';
import styled from 'styled-components';

import { StyledIcon } from '..';
import { TYPE } from '../../Theme';
import ArbitrumLogo from '../../assets/svg/arbitrum-one-logo.svg';
import EthereumLogo from '../../assets/svg/ethereum-logo.svg';
import GnosisLogo from '../../assets/svg/gnosis-chain-logo.svg';
import { SupportedNetwork } from '../../constants';
import { AutoColumn } from '../Column';
import Row, { RowBetween } from '../Row';

const NetworkLogo = {
  [SupportedNetwork.MAINNET]: EthereumLogo,
  [SupportedNetwork.ARBITRUM_ONE]: ArbitrumLogo,
  [SupportedNetwork.XDAI]: GnosisLogo,
};

const Wrapper = styled.div<{ width: number; disabled?: boolean }>`
  z-index: 20;
  position: relative;
  background-color: ${({ theme }) => theme.panelColor};
  border: 1px solid ${({ color, theme }) => color || theme.primary4};
  width: ${({ width }) => (width ? width : '150px')};
  padding: 4px 10px;
  padding-right: 6px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;

  :hover {
    cursor: ${({ disabled }) => (disabled ? 'default' : 'pointer')};
  }
`;

const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;

  & > img {
    height: 20px;
  }
`;

const Dropdown = styled.div`
  position: absolute;
  top: 38px;
  padding-top: 40px;
  background-color: ${({ theme }) => theme.bg1};
  border: 1px solid rgba(0, 0, 0, 0.15);
  padding: 10px 10px;
  border-radius: 8px;
  width: calc(100% - 20px);
  font-weight: 500;
  font-size: 1rem;
  color: black;
  :hover {
    cursor: pointer;
  }
`;

const ArrowStyled = styled(Arrow)`
  height: 20px;
  width: 20px;
  margin-left: 6px;
`;

const Icon = ({ network }) => {
  if (NetworkLogo[network] === undefined) {
    return null;
  }

  return (
    <IconWrapper>
      <img src={NetworkLogo[network]} alt={network} />
    </IconWrapper>
  );
};

interface DropdownSelectProps {
  options: any;
  active: string;
  disabled?: boolean;
  setActive?: (n: any) => void;
  color?: string;
  width?: any;
}

const DropdownSelect = ({ options, active, disabled = false, setActive, color, width = null }: DropdownSelectProps) => {
  const [showDropdown, toggleDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const containerRef = useRef(null);
  useClickAway(dropdownRef, (event) => {
    if (showDropdown && !containerRef.current.contains(event.target)) toggleDropdown(false);
  });

  return (
    <Wrapper color={color} ref={containerRef} width={width} disabled={disabled}>
      {disabled ? (
        <RowBetween justify="center">
          <TYPE.main display="flex" color={'disabled'}>
            {active}
          </TYPE.main>
          <StyledIcon disabled={disabled}>
            <ArrowStyled />
          </StyledIcon>
        </RowBetween>
      ) : (
        <RowBetween onClick={() => toggleDropdown(!showDropdown)} justify="center">
          <TYPE.main display="flex">
            <Icon network={active} />
            {active}
          </TYPE.main>
          <StyledIcon>
            <ArrowStyled />
          </StyledIcon>
        </RowBetween>
      )}
      {showDropdown && (
        <Dropdown>
          <div ref={dropdownRef}>
            <AutoColumn gap="20px">
              {Object.keys(options).map((key, index) => {
                const option = options[key];
                return (
                  option !== active && (
                    <Row
                      onClick={() => {
                        toggleDropdown(!showDropdown);
                        setActive?.(option);
                      }}
                      key={index}
                    >
                      <TYPE.body fontSize={14} display="flex">
                        <Icon network={option} />
                        {option}
                      </TYPE.body>
                    </Row>
                  )
                );
              })}
            </AutoColumn>
          </div>
        </Dropdown>
      )}
    </Wrapper>
  );
};

export default DropdownSelect;
