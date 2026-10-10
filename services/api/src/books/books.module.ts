import { Module } from '@nestjs/common';
import { BooksController } from './books.controller.js';

/** Accounting books: chart of accounts, vouchers, ledgers and the financial statements. Fee receipts post themselves (books.service.ts). */
@Module({ controllers: [BooksController] })
export class BooksModule {}
