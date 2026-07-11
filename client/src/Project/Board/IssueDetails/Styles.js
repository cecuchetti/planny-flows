import styled from 'styled-components';

import { color, font, fontSizes, lineHeights, media, radius } from 'shared/utils/styles';

export const Content = styled.div`
  display: flex;
  padding: 0 30px 60px;

  ${media.tablet} {
    flex-direction: column;
    padding: 0 16px 40px;
  }
`;

export const Left = styled.div`
  width: 65%;
  padding-right: 50px;

  ${media.tablet} {
    width: 100%;
    padding-right: 0;
  }
`;

export const Right = styled.div`
  width: 35%;
  padding-top: 5px;

  ${media.tablet} {
    width: 100%;
    padding-top: 16px;
    border-top: 1px solid ${color.borderLightest};
    margin-top: 16px;
  }
`;

export const TopActions = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 21px 18px 0;

  ${media.tablet} {
    padding: 12px 8px 0;
  }
`;

export const TopActionsRight = styled.div`
  display: flex;
  align-items: center;
  & > * {
    margin-left: 4px;
  }
`;

export const SectionTitle = styled.h2`
  margin: 24px 0 8px;
  padding: 0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: ${color.textDark};
  ${font.size(fontSizes.caption)};
  ${font.bold};
  line-height: ${lineHeights.tight};
`;

export const ReadonlyBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 30px 0;
  padding: 8px 12px;
  background: ${color.statusViolet.bg};
  border: 1px solid ${color.statusViolet.border};
  border-radius: ${radius.small}px;
  color: ${color.statusViolet.text};
  ${font.size(fontSizes.caption)};
  ${font.medium};

  ${media.tablet} {
    margin: 12px 16px 0;
  }
`;

export const ReadonlyKey = styled.span`
  margin-left: auto;
  ${font.bold};
  ${font.size(fontSizes.bodySmall)};
`;

export const ExternalActions = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
`;

export const JiraLink = styled.a`
  color: ${color.textLink};
  text-decoration: none;
  ${font.size(fontSizes.caption)};
  ${font.medium};
  white-space: nowrap;
  &:hover {
    text-decoration: underline;
  }
`;

export const ReadonlyField = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  color: ${color.textDark};
  ${font.size(fontSizes.body)};
`;

export const ReadonlyBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: ${radius.small}px;
  background: ${color.backgroundLight};
  color: ${color.textDark};
  ${font.size(fontSizes.caption)};
  ${font.medium};
`;

export const ReadonlyComment = styled.div`
  margin-top: 20px;
  position: relative;
  padding-left: 34px;
`;

export const ReadonlyCommentBody = styled.p`
  white-space: pre-wrap;
  margin: 4px 0;
`;

export const ReadonlyTitle = styled.h2`
  margin: 16px 0;
  color: ${color.textDarkest};
  ${font.size(fontSizes.pageTitle)};
  ${font.medium};
  line-height: ${lineHeights.tight};
`;
