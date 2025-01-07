import Case from 'case';

export const snakeCase = Case.snake;
export const camelCase = Case.camel;

export const deepSnakeCaseKeys = (val: any): any => {
  if (Array.isArray(val)) {
    return val.map(el => deepSnakeCaseKeys(el)) as any;
  } else if (typeof val === 'object' && val !== null) {
    return Object.entries(val).reduce((acc, [key, value]) => {
      acc[deepSnakeCaseKeys(key)] = value;
      return acc;
    }, {}) as any;
  } else if (typeof val === 'string') {
    return snakeCase(val);
  } else return val as any;
};

export const deepCamelCaseKeys = (val: any): any => {
  if (Array.isArray(val)) {
    return val.map(el => deepCamelCaseKeys(el)) as any;
  } else if (typeof val === 'object' && val !== null) {
    return Object.entries(val).reduce((acc, [key, value]) => {
      acc[deepCamelCaseKeys(key)] = value;
      return acc;
    }, {}) as any;
  } else if (typeof val === 'string') {
    return camelCase(val);
  } else return val as any;
};
