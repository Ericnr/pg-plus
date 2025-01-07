import chalk from 'chalk';
// Ripped off from https://github.com/scriptcoded/sql-highlight

const DEFAULT_OPTIONS = {
  html: false,
  classPrefix: 'sql-hl-',
  colors: {
    keyword: chalk.magenta,
    function: chalk.cyan,
    number: chalk.green,
    string: chalk.green,
    special: chalk.yellow,
    bracket: chalk.yellow,
    boundParameter: chalk.cyanBright,
  },
};

type Options = typeof DEFAULT_OPTIONS;

type Match = { name: string; start: number; length: number };

export function highlight(sqlString: string, options?: Options) {
  options = {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
  };

  const matches = [] as Match[];

  for (const hl of highlighters) {
    let match: RegExpExecArray | null;
    while ((match = hl.regex.exec(sqlString))) {
      const firstMatch = match[0]!;
      const alreadyMatched = matches.some(m => {
        if (!match) return false;

        return (
          match.index >= m.start &&
          match.index + firstMatch.length <= m.start + m.length
          );
      });
      if (alreadyMatched) continue;
      matches.push({
        name: hl.name,
        start: match.index,
        length: (hl.trimEnd != null
          ? firstMatch.substr(0, firstMatch.length - hl.trimEnd)
          : firstMatch
        ).length,
      });
    }
  }

  const sortedMatches = matches.slice().sort((a, b) => a.start - b.start);
  let highlighted = '';

  for (let i = 0; i < sortedMatches.length; i++) {
    const match = sortedMatches[i]!;
    const nextMatch = sortedMatches[i + 1];
    const stringMatch = sqlString.substr(match.start, match.length);
    if (options.html) {
      highlighted += `<span class="${options.classPrefix}${match.name}">`;
      highlighted += stringMatch;
      highlighted += '</span>';
    } else {
      const color = options.colors[match.name];
      highlighted += color(stringMatch);
    }

    // add substr between matches
    if (nextMatch != null) {
      highlighted += sqlString.slice(
        match.start + match.length,
        nextMatch.start
      );
    } else {
      // add substr after last match
      if (match.start + match.length !== sqlString.length) {
        highlighted += sqlString.substr(
          match.start + match.length,
          sqlString.length
        );
      }
    }
  }

  return highlighted;
}

const KEYWORDS = [
  'ADD',
  'ADD CONSTRAINT',
  'ALTER',
  'ALTER COLUMN',
  'ALTER TABLE',
  'ALL',
  'AND',
  'AS',
  'ASC',
  'BACKUP DATABASE',
  'BETWEEN',
  'CASE',
  'CHECK',
  'COLUMN',
  'CONSTRAINT',
  'CREATE',
  'CREATE DATABASE',
  'CREATE INDEX',
  'CREATE OR REPLACE VIEW',
  'CREATE TABLE',
  'CREATE PROCEDURE',
  'CREATE UNIQUE INDEX',
  'CREATE VIEW',
  'DATABASE',
  'DEFAULT',
  'DELETE',
  'DESC',
  'DISTINCT',
  'DROP',
  'DROP COLUMN',
  'DROP CONSTRAINT',
  'DROP DATABASE',
  'DROP DEFAULT',
  'DROP INDEX',
  'DROP TABLE',
  'DROP VIEW',
  'END',
  'EXEC',
  'EXISTS',
  'FOREIGN KEY',
  'FROM',
  'FULL OUTER JOIN',
  'GROUP BY',
  'HAVING',
  'IN',
  'INTO',
  'INDEX',
  'INNER JOIN',
  'INSERT INTO',
  'INSERT INTO SELECT',
  'IS NULL',
  'IS NOT NULL',
  'JOIN',
  'LEFT JOIN',
  'LIKE',
  'LIMIT',
  'NOT',
  'NOT NULL',
  'OR',
  'ORDER BY',
  'OUTER JOIN',
  'PRIMARY KEY',
  'PROCEDURE',
  'RETURNING',
  'RIGHT JOIN',
  'ROWNUM',
  'SELECT',
  'SELECT DISTINCT',
  'SELECT INTO',
  'SELECT TOP',
  'SET',
  'TABLE',
  'TOP',
  'TRUNCATE TABLE',
  'UNION',
  'UNION ALL',
  'UNIQUE',
  'UPDATE',
  'VALUES',
  'VIEW',
  'WHERE',
  'PRAGMA',
  'INTEGER',
  'PRIMARY',
  'letCHAR',
  'DATETIME',
  'NULL',
  'REFERENCES',
  'INDEX_LIST',
  'BY',
  'CURRENT_DATE',
  'CURRENT_TIME',
  'EACH',
  'ELSE',
  'ELSEIF',
  'FALSE',
  'FOR',
  'GROUP',
  'IF',
  'INSERT',
  'INTERVAL',
  'IS',
  'KEY',
  'KEYS',
  'LEFT',
  'MATCH',
  'ON',
  'OPTION',
  'OFFSET',
  'OUT',
  'OUTER',
  'REPLACE',
  'TINYINT',
  'RIGHT',
  'THEN',
  'TO',
  'TRUE',
  'WHEN',
  'UNSIGNED',
  'CASCADE',
  'ENGINE',
  'TEXT',
  'AUTO_INCREMENT',
  'SHOW',
].reduce((acc, cur) => (acc.push(cur, cur.toLowerCase()), acc), [] as string[]);

const SPLIT_CHARS = '[^a-zA-Z_"]';

const highlighters = [
  {
    name: 'function',
    regex: /(\w*?)\(/g,
    trimEnd: 1,
  },
  {
    name: 'keyword',
    regex: new RegExp(
      `(?!${SPLIT_CHARS})(?:${KEYWORDS.join('|')})(?=${SPLIT_CHARS}|$)`,
      // `(?:^|${SPLIT_CHARS})(?:${KEYWORDS.join('|')})(?=${SPLIT_CHARS})`,
      'g'
    ),
  },
  {
    name: 'special',
    regex: /(=|%|\/|\*|-|,|;|:|\+|<|>)/g,
  },

  {
    name: 'boundParameter',
    regex: /\$\d+/g,
  },
  {
    name: 'number',
    regex: /(\d+)/g,
  },
  {
    name: 'string',
    regex: /(['].*?['])/g,
  },
  {
    name: 'bracket',
    regex: /([()])/g,
  },
];
