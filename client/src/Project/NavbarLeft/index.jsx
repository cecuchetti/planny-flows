import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { Icon, AboutTooltip } from 'shared/components';

import { NavLeft, LogoLink, StyledLogo, Bottom, Item, ItemText, LangSwitcher, LangButton } from './Styles';

const propTypes = {
  issueSearchModalOpen: PropTypes.func.isRequired,
  issueCreateModalOpen: PropTypes.func.isRequired,
};

const ProjectNavbarLeft = ({ issueSearchModalOpen, issueCreateModalOpen }) => {
  const { t, i18n } = useTranslation();

  return (
    <NavLeft>
      <LogoLink to="/">
        <StyledLogo />
      </LogoLink>

      <Item as="button" type="button" onClick={issueSearchModalOpen} aria-label={t('nav.searchIssues')}>
        <Icon type="search" size={22} top={1} left={3} />
        <ItemText>{t('nav.searchIssues')}</ItemText>
      </Item>

      <Item as="button" type="button" onClick={issueCreateModalOpen} aria-label={t('nav.createIssue')}>
        <Icon type="plus" size={27} />
        <ItemText>{t('nav.createIssue')}</ItemText>
      </Item>

      <Bottom>
        <LangSwitcher>
          <LangButton
            type="button"
            className={i18n.language === 'en' ? 'active' : ''}
            onClick={() => i18n.changeLanguage('en')}
            aria-label="English"
          >
            EN
          </LangButton>
          <LangButton
            type="button"
            className={i18n.language === 'es' ? 'active' : ''}
            onClick={() => i18n.changeLanguage('es')}
            aria-label="Español"
          >
            ES
          </LangButton>
        </LangSwitcher>
        <AboutTooltip
          placement="right"
          offset={{ top: -218 }}
          renderLink={linkProps => (
            <Item {...linkProps}>
              <Icon type="help" size={25} />
              <ItemText>{t('nav.about')}</ItemText>
            </Item>
          )}
        />
      </Bottom>
    </NavLeft>
  );
};

ProjectNavbarLeft.propTypes = propTypes;

export default ProjectNavbarLeft;
