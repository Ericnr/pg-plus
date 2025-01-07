export const makePgConnectionString = ({
  host,
  user,
  port,
  database,
  password,
}: {
  host: string;
  user: string;
  port: string | number;
  database: string;
  password?: string;
}) => {
  let connectionString = `postgress://${user}`;
  if (password != null) connectionString += `:${password}`;
  connectionString += `@${host}:${port}/${database}`;

  return connectionString;
};
