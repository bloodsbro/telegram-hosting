import { knex } from 'knex';

const db = knex({
  client: 'mysql2',
  connection: {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASS,
    database: process.env.MYSQL_DB,
    pool: {
      min: 2,
      max: 100
    }
  }
});

export { db };