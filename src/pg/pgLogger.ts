import chalk from 'chalk';
import { OnErrorEvent, OnQueryEvent, OnTransactionEvent } from './pgPlus';
import { highlight } from 'sql-highlight';

export const pgQueryLogger = ({ query, params }: OnQueryEvent) => {
  if (process.env.NODE_ENV !== 'development') return;

  const excludedQueries = ['"sessions"', 'no-log'];
  if (excludedQueries.some(excluded => query.includes(excluded))) return null;

  console.log(highlight(removeIndentation(query)));

  if (params?.length) {
    for (const [index, value] of params.entries()) {
      console.log(`${chalk.cyanBright('$' + (index + 1))} - ${value}`);
    }
  }
  console.log();
};

const CHECK_CONSTRAINT_VIOLATION = '23514';
const UNIQUE_CONSTRAINT_VIOLATION = '23505';

const codeToMessage = {
  [CHECK_CONSTRAINT_VIOLATION]: 'Check constraint violation',
  [UNIQUE_CONSTRAINT_VIOLATION]: 'Unique constraint violation',
};

export const pgErrorLogger = ({ error }: OnErrorEvent) => {
  if (process.env.NODE_ENV !== 'development') return;
  
  console.log(chalk.red.underline('Pg Error') + ': ' + error.message);
  if (error.code != null)
    console.log(
      chalk.cyan('code:'),
      `"${error.code}"`,
      codeToMessage[error.code] || ''
    );

  if (error.constraint != null)
    console.log(chalk.cyan('constraint:'), error.constraint);
  if (error.detail != null) console.log(chalk.cyan('detail:'), error.detail);
  if (error.hint != null) console.log(chalk.cyan('hint:'), error.hint);
  console.log();
};

export const pgTransactionLogger = (e: OnTransactionEvent) => {
  if (process.env.NODE_ENV !== 'development') return;
  
  if (e.query === 'COMMIT') {
    console.log(chalk.green('COMMIT') + ' - ' + e.duration + 'ms\n');
  } else if (e.query === 'ROLLBACK') {
    console.log(chalk.red('ROLLBACK') + ' - ' + e.duration + 'ms\n');
  } else {
    console.log(chalk.green('BEGIN'));
  }
};

export const removeIndentation = (str: string) =>
  str
    .split('\n')
    .map(part => part.trim())
    .filter(Boolean)
    .join('\n');
