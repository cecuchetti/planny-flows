import styled from 'styled-components';

export const Shell = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
`;
export const Nav = styled.nav`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 16px 0 28px;
`;
export const NavLink = styled.button`
  padding: 10px 14px;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  background: ${({ active }) => (active ? '#315f72' : '#e8eef0')};
  color: ${({ active }) => (active ? '#fff' : '#223')};
`;
export const Panel = styled.section`
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 1px 5px #0001;
`;
export const Row = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`;
export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 220px;
  flex: 1;
`;
export const Input = styled.input`
  padding: 10px;
  border: 1px solid #bbc7ca;
  border-radius: 5px;
`;
export const Select = styled.select`
  padding: 10px;
  border: 1px solid #bbc7ca;
  border-radius: 5px;
  background: #fff;
`;
export const Card = styled.article`
  background: #fff;
  border: 1px solid #e2e9eb;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
`;
export const ErrorText = styled.p`
  color: #b3261e;
  margin: 8px 0;
`;
export const Muted = styled.span`
  color: #5b6b70;
`;
