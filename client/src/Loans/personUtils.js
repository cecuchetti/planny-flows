/**
 * Shared utility functions for Person views.
 *
 * Moved from Borrowers/index.jsx so both Borrowers and PersonDetail can use
 * them without duplication.
 */

/** Extract initials from first + last name (uppercase, 2 chars). */
export const getInitials = (firstName, lastName) => {
  const a = (firstName || '')[0] || '';
  const b = (lastName || '')[0] || '';
  return (a + b).toUpperCase();
};

/** Gradient class for the avatar based on name hash (deterministic). */
export const avatarGradient = (seed) => {
  const gradients = [
    'from-primary to-secondary',
    'from-surface-variant to-secondary-container',
    'from-secondary to-primary-container',
    'from-primary to-primary-container',
    'from-secondary-container to-secondary',
  ];
  let hash = 0;
  for (let i = 0; i < (seed || '').length; i += 1) {
    hash = seed.charCodeAt(i) + (hash * 32 - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
};

/** Get WhatsApp link from a phone number (digits only). */
export const whatsappLink = (phone) => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '#';
};
