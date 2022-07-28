import dayjs from 'dayjs';
import PropTypes from 'prop-types';

import { Typography } from '../../../Theme';
import { formattedNum } from '../../../utils';
import { Wrapper } from './styled';

const CrosshairTooltip = ({ title, active, payload, isValueCurrency }) => {
  if (active && payload && payload.length) {
    const { time, value } = payload[0].payload;
    return (
      <Wrapper>
        <Typography.Text color={'text10'}>{dayjs(time).format('MMMM D, YYYY')}</Typography.Text>
        <Typography.Text color={'text10'}>{title}</Typography.Text>
        <Typography.Text color={'text10'}>
          {isValueCurrency && '$'} {formattedNum(value)}
        </Typography.Text>
      </Wrapper>
    );
  }

  return null;
};

CrosshairTooltip.propTypes = {
  title: PropTypes.string,
  active: PropTypes.bool,
  payload: PropTypes.array,
  isValueCurrency: PropTypes.bool,
};

CrosshairTooltip.defaultProps = {
  isValueCurrency: true,
};

export default CrosshairTooltip;
