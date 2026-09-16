import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

@Injectable()
export class TransactionRunner {
  private sqliteQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Runs a database transaction.
   * For SQLite: serializes execution through a promise chain as a driver workaround.
   * For PostgreSQL: executes concurrently.
   * Note: Actual concurrency protection is enforced at the database level via atomic conditional UPDATEs.
   */
  async run<T>(operation: (manager: EntityManager) => Promise<T>): Promise<T> {
    const dbType = this.dataSource.options.type;
    const isSqlite = dbType === 'sqlite' || dbType === 'better-sqlite3';

    if (!isSqlite) {
      return this.dataSource.transaction(operation);
    }

    // Serialize for SQLite driver single-connection limitation
    return new Promise<T>((resolve, reject) => {
      this.sqliteQueue = this.sqliteQueue
        .then(async () => {
          try {
            const result = await this.dataSource.transaction(operation);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        })
        .catch(() => {
          // Keep queue alive even if a previous operation failed
        });
    });
  }
}
