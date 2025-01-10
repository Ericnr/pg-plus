import {
  AppUser,
  AppUserId,
  AppUserInsertable,
  AppUserUpdater,
  Customer,
  CustomerId,
  CustomerInsertable,
  CustomerUpdater,
  Product,
  ProductId,
  ProductInsertable,
  ProductUpdater,
  Todo,
  TodoId,
  TodoInsertable,
  TodoUpdater,
} from '../generated/kanel';
import { DB } from '../pg/postgres';

export type ModelMap = {
  app_user: AppUser;
  todo: Todo;
  product: Product;
  customer: Customer;
};

export type InsertableMap = {
  app_user: AppUserInsertable;
  todo: TodoInsertable;
  product: ProductInsertable;
  customer: CustomerInsertable;
};

export type UpdaterMap = {
  app_user: AppUserUpdater;
  todo: TodoUpdater;
  product: ProductUpdater;
  customer: CustomerUpdater;
};

export type Models = keyof ModelMap;

export type ModelIdMap = {
  app_user: AppUserId;
  todo: TodoId;
  product: ProductId;
  customer: CustomerId;
};

export type ModelIdMapd = {
  [K in keyof ModelMap as ModelMap[K] extends { id: any }
    ? K
    : never]: ModelMap[K] extends { id: infer P } ? P : never;
};

type GetTable<T extends Models> = {
  id: ModelIdMap[T];
  table: ModelMap[T];
  insertable: InsertableMap[T];
  updater: UpdaterMap[T];
};

export type DatabaseRepresentation = {
  [K in Models]: GetTable<K>;
};

export type { DB };

  export {
    AppUser, AppUserId, AppUserInsertable,
    AppUserUpdater, Customer, CustomerId, CustomerInsertable,
    CustomerUpdater, Product, ProductId, ProductInsertable,
    ProductUpdater, Todo, TodoId, TodoInsertable,
    TodoUpdater
  };

