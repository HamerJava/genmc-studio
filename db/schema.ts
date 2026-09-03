import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const drafts=sqliteTable('drafts',{owner:text('owner').primaryKey(),skin:text('skin').notNull(),updated:integer('updated').notNull()});
export const skins=sqliteTable('skins',{id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),model:text('model').notNull(),pixels:text('pixels').notNull(),sourceId:text('source_id'),created:integer('created').notNull()},t=>[index('skins_created_idx').on(t.created)]);
