import styled from 'styled-components';

import { color, font, mixin, media } from 'shared/utils/styles';
import { InputDebounced, Avatar, Button } from 'shared/components';

export const Filters = styled.div`
  display: flex;
  align-items: center;
  margin-top: 24px;
  gap: 8px;
  flex-wrap: wrap;

  ${media.tablet} {
    margin-top: 16px;
    gap: 6px;
  }
`;

export const SearchInput = styled(InputDebounced)`
  margin-right: 10px;
  width: 160px;

  ${media.tablet} {
    width: 140px;
    margin-right: 6px;
  }
`;

export const Avatars = styled.div`
  display: flex;
  flex-direction: row-reverse;
  margin: 0 8px 0 2px;

  ${media.tablet} {
    margin: 0 4px 0 2px;
  }
`;

export const AvatarIsActiveBorder = styled.div`
  display: inline-flex;
  margin-left: -2px;
  border-radius: 50%;
  transition: transform 0.1s;
  ${mixin.clickable};
  ${props => props.$isActive && `box-shadow: 0 0 0 4px ${color.primary}`}
  &:hover {
    transform: translateY(-5px);
  }
`;

export const StyledAvatar = styled(Avatar)`
  box-shadow: 0 0 0 2px #fff;
`;

export const StyledButton = styled(Button)`
  margin-left: 4px;

  ${media.tablet} {
    padding: 0 10px;
    font-size: 13px;
  }
`;

export const ClearAll = styled.div`
  height: 32px;
  line-height: 32px;
  margin-left: 10px;
  padding-left: 10px;
  border-left: 1px solid ${color.borderLightest};
  color: ${color.textDark};
  ${font.size(14.5)}
  ${mixin.clickable}
  &:hover {
    color: ${color.textMedium};
  }

  ${media.tablet} {
    margin-left: 6px;
    padding-left: 6px;
    font-size: 13px;
  }
`;
