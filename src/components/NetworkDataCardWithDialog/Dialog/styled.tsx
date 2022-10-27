import { DialogContent, DialogOverlay } from '@reach/dialog';
import '@reach/dialog/styles.css';
import styled from 'styled-components';

const StyledDialogContent = styled(DialogContent)`
  &[data-reach-dialog-content] {
    width: 50vw;
    max-height: 380px;
    height: 100%;
    margin: 10vh auto;
    border-radius: 8px;
    border: ${({ theme }) => `1px solid ${theme.bg3}`};
    background: linear-gradient(143.3deg, rgba(46, 23, 242, 0.5) -120%, rgba(46, 23, 242, 0) 60%),
      linear-gradient(113.18deg, rgba(255, 255, 255, 0.1) 0%, rgba(0, 0, 0, 0) 100%), rgba(23, 22, 23);
    background-blend-mode: normal, overlay, normal;
    backdrop-filter: blur(25px);
    padding: 1.25rem;
    outline: none;

    @media screen and (max-width: 1080px) {
      width: 80vw;
    }
  }
`;

const StyledDialogOverlay = styled(DialogOverlay)`
  z-index: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: hsla(0, 0%, 0%, 0.33);
  position: fixed;
  inset: 0;
`;

const Wrapper = styled.div`
  height: 312px;
  position: relative;
`;

export { StyledDialogContent, StyledDialogOverlay, Wrapper };
