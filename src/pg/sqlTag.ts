import { removeIndentation } from './pgLogger';

const SqlTagSymbol = Symbol('SqlTag');

export type SqlTag = {
  strings: string[];
  expressions: any[];
  compile: () => BaseQueryConfig;
  [SqlTagSymbol]: true;
};

export type BaseQueryConfig = {
  query: string;
  params?: any[];
};

type MaybeReadonly<T> = Readonly<T> | T;
type ExpressionType = MaybeReadonly<
  string | string[] | number | number[] | SqlTag
>;

export type QueryConfig = BaseQueryConfig | SqlTag;

const flattenSqlTag = (tag: SqlTag, paramIdx = -1) => {
  const queryParts = [] as string[];
  const params = {} as Record<string, any>;
  // let paramIdx = 0;
  // const params = [] as { expressionIdx: number; value: any }[];
  tag.strings.forEach((cur, i) => {
    queryParts.push(cur);
    const nextExp = tag.expressions[i] as ExpressionType;
    paramIdx++;
    if (nextExp != null) {
      if (nextExp[SqlTagSymbol] === true) {
        const exp = nextExp as SqlTag;

        const flat = flattenSqlTag(exp, paramIdx);
        paramIdx = flat.paramIdx;
        queryParts.push(...flat.queryParts);

        Object.assign(params, flat.params);
      } else {
        params[paramIdx] = nextExp;
      }
    }
  });

  return { queryParts, params, paramIdx };
};

export function sql(
  ttl: TemplateStringsArray,
  ...expressions: ExpressionType[]
): SqlTag {
  const tag = {
    [SqlTagSymbol]: true as const,
    strings: [...ttl],
    expressions,
    compile: (): BaseQueryConfig => {
      const { queryParts, params } = flattenSqlTag(tag);
      let paramIdx = 0;
      const query = queryParts.reduce((acc, cur, i) => {
        if (i in params) return acc + cur + `$${++paramIdx}`;
        return acc + cur;
      }, '');

      return { query: removeIndentation(query), params: Object.values(params) };
    },
  };

  return tag;
}

sql.id = function id(
  ...ids: [string] | [string, string] | [string, string, string]
) {
  return sql([ids.map((str) => `"${str}"`).join('.')] as any);
};

const isSqlTag = (config: QueryConfig): config is SqlTag =>
  SqlTagSymbol in config;

export const compileConfig = (config: QueryConfig) => {
  return isSqlTag(config) ? config.compile() : config;
};

// console.log(sql`
// ${3} something ${99}`.compile());
