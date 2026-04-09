import dayjs from 'shared/utils/dayjs';

export const formatDate = (date, format = 'MMMM D, YYYY') =>
  date ? dayjs(date).format(format) : date;

export const formatDateTime = (date, format = 'MMMM D, YYYY, h:mm A') =>
  date ? dayjs(date).format(format) : date;

export const formatDateTimeForAPI = (date) => (date ? dayjs(date).utc().format() : date);

export const formatDateTimeConversational = (date) => (date ? dayjs(date).fromNow() : date);
