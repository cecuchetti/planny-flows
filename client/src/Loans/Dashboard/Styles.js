import styled from 'styled-components';

import { color, font, fontSizes, lineHeights, mixin, radius } from 'shared/utils/styles';

/*
 * The dashboard's own shapes: a grid of per-currency metric cards and a clickable
 * list row for the near-completion and recent-activity references. Everything
 * else (the section chrome, the card grid, the list) is reused from `../Styles`.
 */

/** The per-currency cards laid out like the loan cards. */
export const CurrencyGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  margin-top: 16px;
`;

/** One currency's card: a header chip plus its metric lines. */
export const CurrencyCard = styled.article`
  background: #fff;
  border: 1px solid ${color.borderLightest};
  border-radius: ${radius.medium}px;
  padding: 14px 16px;
`;

export const CurrencyHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
`;

export const MetricLine = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 6px 0;
  ${font.size(fontSizes.bodySmall)}
  color: ${color.textDark};
`;

export const MetricLabel = styled.span`
  color: ${color.textMedium};
`;

export const MetricValue = styled.strong`
  color: ${color.textDarkest};
  font-weight: 600;
`;

/** A read-only reference that drills through to its loan. */
export const ReferenceButton = styled.button`
  border: none;
  background: none;
  padding: 0;
  text-align: left;
  width: 100%;
  ${font.medium}
  ${font.size(fontSizes.bodySmall)}
  color: ${color.textLink};
  line-height: ${lineHeights.relaxed};
  ${mixin.clickable}

  &:hover {
    text-decoration: underline;
  }
`;

export const Subtitle = styled.p`
  ${font.size(fontSizes.bodySmall)}
  color: ${color.textMedium};
  margin: 16px 0 0;
`;
