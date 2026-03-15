import jwt, { SignOptions } from 'jsonwebtoken';
import { isPlainObject } from 'lodash';
import ms from 'ms';

import { appConfig } from 'config';
import { InvalidTokenError } from 'errors';

export const signToken = (payload: object, options?: SignOptions): string => {
  const signOptions: SignOptions = {
    expiresIn: appConfig.jwt.expiresIn as ms.StringValue,
    ...options,
  };
  return jwt.sign(payload, appConfig.jwt.secret, signOptions);
};

export const verifyToken = (token: string): { [key: string]: any } => {
  try {
    const payload = jwt.verify(token, appConfig.jwt.secret);

    if (isPlainObject(payload)) {
      return payload as { [key: string]: any };
    }
    throw new Error();
  } catch (error) {
    throw new InvalidTokenError();
  }
};
