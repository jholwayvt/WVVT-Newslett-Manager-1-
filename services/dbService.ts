import { MOCK_SUBSCRIBERS, MOCK_TAGS, MOCK_CAMPAIGNS } from '../constants';
import { Database, Subscriber, Tag, Campaign, SocialLink } from '../types';

declare const initSqlJs: (config?: any) => Promise<any>;

export type DB = any;
type AppSubscriber = Subscriber & { tags: number[] };

let SQL: any;

const DB_LOCAL_STORAGE_KEY = 'wvvt_sqlite_db';
const ACTIVE_DB_ID_KEY = 'wvvt_active_db_id';

// --- INITIALIZATION & SCHEMA ---

const getSql = async () => {
    if (!SQL) {
        SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
        });
    }
    return SQL;
};

const SCHEMA = `
    CREATE TABLE databases (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        logo_base64 TEXT,
        street TEXT,
        city TEXT,
        state TEXT,
        zip_code TEXT,
        county TEXT,
        website TEXT,
        phone TEXT,
        fax_number TEXT,
        social_links_json TEXT,
        key_contact_name TEXT,
        key_contact_phone TEXT,
        key_contact_email TEXT
    );
    CREATE TABLE subscribers (
        id INTEGER PRIMARY KEY,
        database_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        subscribed_at TEXT NOT NULL,
        unsubscribed_at TEXT,
        external_id TEXT,
        UNIQUE(database_id, email),
        FOREIGN KEY(database_id) REFERENCES databases(id) ON DELETE CASCADE
    );
    CREATE TABLE tags (
        id INTEGER PRIMARY KEY,
        database_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        UNIQUE(database_id, name),
        FOREIGN KEY(database_id) REFERENCES databases(id) ON DELETE CASCADE
    );
    CREATE TABLE campaigns (
        id INTEGER PRIMARY KEY,
        database_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        body TEXT,
        sent_at TEXT,
        recipient_count INTEGER,
        status TEXT NOT NULL,
        target_tags_json TEXT,
        target_logic TEXT,
        recipients_json TEXT,
        FOREIGN KEY(database_id) REFERENCES databases(id) ON DELETE CASCADE
    );
    CREATE TABLE subscriber_tags (
        subscriber_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY(subscriber_id, tag_id),
        FOREIGN KEY(subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
        FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
`;

const runMigrations = (db: DB) => {
    // Check for databases table first
    const mainTableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='databases';");
    if (mainTableCheck.length === 0) {
        db.exec(SCHEMA);
        return; // Schema created, no migrations needed.
    }
    
    // Migration for 'databases' table
    const dbColumnsResult = db.exec("PRAGMA table_info(databases);");
    const dbColumns = dbColumnsResult[0].values.map((col: any) => col[1]);
    const newDbColumns = [
        { name: 'logo_base64', type: 'TEXT' }, { name: 'address', type: 'TEXT' },
        { name: 'website', type: 'TEXT' }, { name: 'phone', type: 'TEXT' },
        { name: 'social_links_json', type: 'TEXT' }, { name: 'street', type: 'TEXT' },
        { name: 'city', type: 'TEXT' }, { name: 'state', type: 'TEXT' },
        { name: 'zip_code', type: 'TEXT' }, { name: 'county', type: 'TEXT' },
        { name: 'fax_number', type: 'TEXT' }, { name: 'key_contact_name', type: 'TEXT' },
        { name: 'key_contact_phone', type: 'TEXT' }, { name: 'key_contact_email', type: 'TEXT' },
    ];

    newDbColumns.forEach(col => {
        if (!dbColumns.includes(col.name)) {
            try {
                db.exec(`ALTER TABLE databases ADD COLUMN ${col.name} ${col.type};`);
                console.log(`Migrated: Added column ${col.name} to databases table.`);
            } catch (e) {
                console.error(`Migration failed for column ${col.name}:`, e);
            }
        }
    });

    // Migration for 'subscribers' table
    const subColumnsResult = db.exec("PRAGMA table_info(subscribers);");
    const subColumns = subColumnsResult[0].values.map((col: any) => col[1]);
     if (!subColumns.includes('unsubscribed_at')) {
        try {
            db.exec(`ALTER TABLE subscribers ADD COLUMN unsubscribed_at TEXT;`);
            console.log(`Migrated: Added column unsubscribed_at to subscribers table.`);
        } catch (e) {
            console.error(`Migration failed for column unsubscribed_at:`, e);
        }
    }
};


const createAndSeedDatabase = (sql: any): DB => {
    const db = new sql.Database();
    db.exec(SCHEMA);

    // Seed with mock data
    const dbId = Date.now();
    db.run('INSERT INTO databases (id, name, description) VALUES (?, ?, ?)', [
        dbId, 'Default Newsletter', 'Auto-generated starter database'
    ]);

    MOCK_TAGS.forEach(tag => {
        db.run('INSERT OR IGNORE INTO tags (id, database_id, name) VALUES (?, ?, ?)', [tag.id, dbId, tag.name]);
    });

    MOCK_SUBSCRIBERS.forEach(sub => {
        db.run('INSERT OR IGNORE INTO subscribers (id, database_id, email, name, subscribed_at, unsubscribed_at) VALUES (?, ?, ?, ?, ?, ?)', [
            sub.id, dbId, sub.email, sub.name, sub.subscribed_at, sub.unsubscribed_at
        ]);
        sub.tags.forEach(tagId => {
            db.run('INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)', [sub.id, tagId]);
        });
    });

    MOCK_CAMPAIGNS.forEach(camp => {
        db.run(`INSERT INTO campaigns (id, database_id, subject, body, sent_at, recipient_count, status, target_tags_json, target_logic, recipients_json) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [camp.id, dbId, camp.subject, camp.body, camp.sent_at, camp.recipient_count, camp.status, JSON.stringify(camp.target.tags), camp.target.logic, JSON.stringify(camp.recipients)]
        );
    });

    setActiveDbId(dbId);
    return db;
};

export const initDB = async (): Promise<DB> => {
    const sql = await getSql();
    const storedDb = localStorage.getItem(DB_LOCAL_STORAGE_KEY);
    let db;
    if (storedDb) {
        try {
            const binary = Uint8Array.from(JSON.parse(storedDb));
            db = new sql.Database(binary);
            runMigrations(db); // Run non-destructive migrations
        } catch (e) {
            console.error("Failed to load DB from localStorage, creating new one.", e);
            localStorage.removeItem(DB_LOCAL_STORAGE_KEY);
            db = createAndSeedDatabase(sql);
        }
    } else {
        db = createAndSeedDatabase(sql);
    }
    return db;
};

export const createBlankDb = () => {
    if (!SQL) throw new Error("SQL.js not initialized");
    const db = new SQL.Database();
    db.exec(SCHEMA);
    return db;
}


// --- DB STORAGE & UTILS ---

export const saveDbToLocalStorage = (db: DB) => {
    const binary = db.export();
    localStorage.setItem(DB_LOCAL_STORAGE_KEY, JSON.stringify(Array.from(binary)));
};

export const loadDbFromExternalFile = async (data: Uint8Array): Promise<DB> => {
    const sql = await getSql();
    return new sql.Database(data);
};

export const setActiveDbId = (id: number | null) => {
    if (id === null) {
        localStorage.removeItem(ACTIVE_DB_ID_KEY);
    } else {
        localStorage.setItem(ACTIVE_DB_ID_KEY, JSON.stringify(id));
    }
};

export const getActiveDbId = (): number | null => {
    const id = localStorage.getItem(ACTIVE_DB_ID_KEY);
    return id ? JSON.parse(id) : null;
};

// --- DATA ACCESS HELPERS ---
const parseResults = (stmt: any): any[] => {
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
};


// --- READ OPERATIONS ---

export const getDatabases = async (db: DB): Promise<Omit<Database, 'subscribers'|'tags'|'campaigns'>[]> => {
    const stmt = db.prepare('SELECT * FROM databases');
    const results = parseResults(stmt);
    return results.map(dbRow => ({
        ...dbRow,
        social_links: JSON.parse(dbRow.social_links_json || '[]'),
    }));
};

export const getDatabaseContents = async (db: DB, databaseId: number): Promise<Database> => {
    const dbInfoStmt = db.prepare('SELECT * FROM databases WHERE id = :id');
    dbInfoStmt.bind({ ':id': databaseId });
    const dbInfoResult = parseResults(dbInfoStmt)[0];
    if (!dbInfoResult) throw new Error("Database not found");
    
    const dbInfo = {
        ...dbInfoResult,
        social_links: JSON.parse(dbInfoResult.social_links_json || '[]')
    };

    const subsStmt = db.prepare('SELECT * FROM subscribers WHERE database_id = :id');
    subsStmt.bind({ ':id': databaseId });
    const subscribers: AppSubscriber[] = parseResults(subsStmt).map((s: Subscriber) => ({ ...s, tags: [] }));

    const tagsStmt = db.prepare('SELECT * FROM tags WHERE database_id = :id');
    tagsStmt.bind({ ':id': databaseId });
    const tags: Tag[] = parseResults(tagsStmt);

    const subTagsStmt = db.prepare(`
        SELECT st.subscriber_id, st.tag_id FROM subscriber_tags st
        JOIN subscribers s ON s.id = st.subscriber_id
        WHERE s.database_id = :id
    `);
    subTagsStmt.bind({ ':id': databaseId });
    const subTags = parseResults(subTagsStmt);
    
    const subMap = new Map(subscribers.map(s => [s.id, s]));
    subTags.forEach(st => {
        const sub = subMap.get(st.subscriber_id);
        if (sub) {
            sub.tags.push(st.tag_id);
        }
    });

    const campaignsStmt = db.prepare('SELECT * FROM campaigns WHERE database_id = :id');
    campaignsStmt.bind({ ':id': databaseId });
    const campaigns: Campaign[] = parseResults(campaignsStmt).map((c: any) => ({
        ...c,
        recipients: JSON.parse(c.recipients_json || '[]'),
        target: {
            tags: JSON.parse(c.target_tags_json || '[]'),
            logic: c.target_logic
        }
    }));
    
    return { ...dbInfo, subscribers, tags, campaigns };
}


// --- WRITE OPERATIONS ---

type DatabaseProfileData = Omit<Database, 'id' | 'subscribers' | 'tags' | 'campaigns'>;

export const addDatabase = async (db: DB, data: DatabaseProfileData): Promise<{ id: number }> => {
    const id = Date.now();
    db.run(`INSERT INTO databases (id, name, description, logo_base64, website, phone, social_links_json, street, city, state, zip_code, county, fax_number, key_contact_name, key_contact_phone, key_contact_email) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [
                id, data.name, data.description, data.logo_base64 || null, 
                data.website || null, data.phone || null, JSON.stringify(data.social_links || []),
                data.street || null, data.city || null, data.state || null, data.zip_code || null,
                data.county || null, data.fax_number || null, data.key_contact_name || null,
                data.key_contact_phone || null, data.key_contact_email || null
            ]
    );
    saveDbToLocalStorage(db);
    return { id };
};

export const updateDatabase = async (db: DB, data: Omit<Database, 'subscribers' | 'tags' | 'campaigns'>) => {
    db.run(`UPDATE databases SET 
                name = ?, description = ?, logo_base64 = ?, website = ?, phone = ?, social_links_json = ?,
                street = ?, city = ?, state = ?, zip_code = ?, county = ?, fax_number = ?,
                key_contact_name = ?, key_contact_phone = ?, key_contact_email = ?
            WHERE id = ?`,
            [
                data.name, data.description, data.logo_base64 || null, 
                data.website || null, data.phone || null, JSON.stringify(data.social_links || []),
                data.street || null, data.city || null, data.state || null, data.zip_code || null,
                data.county || null, data.fax_number || null, data.key_contact_name || null,
                data.key_contact_phone || null, data.key_contact_email || null,
                data.id
            ]
    );
    saveDbToLocalStorage(db);
};

export const deleteDatabase = async (db: DB, id: number) => {
    db.run('DELETE FROM databases WHERE id = ?', [id]);
    saveDbToLocalStorage(db);
}

export const addSubscriber = async (db: DB, databaseId: number, sub: Omit<AppSubscriber, 'id' | 'subscribed_at' | 'unsubscribed_at'>): Promise<Subscriber> => {
    const id = Date.now();
    const subscribed_at = new Date().toISOString().split('T')[0];
    db.run('INSERT INTO subscribers (id, database_id, email, name, subscribed_at, unsubscribed_at, external_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        id, databaseId, sub.email, sub.name, subscribed_at, null, sub.external_id || null
    ]);
    sub.tags.forEach(tagId => {
        db.run('INSERT INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)', [id, tagId]);
    });
    saveDbToLocalStorage(db);
    return { ...sub, id, subscribed_at, unsubscribed_at: null };
};

export const updateSubscriber = async (db: DB, sub: AppSubscriber) => {
    db.run('UPDATE subscribers SET name = ?, email = ?, external_id = ? WHERE id = ?', [sub.name, sub.email, sub.external_id || null, sub.id]);
    db.run('DELETE FROM subscriber_tags WHERE subscriber_id = ?', [sub.id]);
    sub.tags.forEach(tagId => {
        db.run('INSERT INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)', [sub.id, tagId]);
    });
    saveDbToLocalStorage(db);
};

export const setSubscriberStatus = async (db: DB, subscriberId: number, isSubscribed: boolean) => {
    const unsubscribed_at = isSubscribed ? null : new Date().toISOString();
    db.run('UPDATE subscribers SET unsubscribed_at = ? WHERE id = ?', [unsubscribed_at, subscriberId]);
    saveDbToLocalStorage(db);
}

export const deleteSubscriber = async (db: DB, id: number) => {
    db.run('DELETE FROM subscribers WHERE id = ?', [id]);
    saveDbToLocalStorage(db);
};

export const addTag = async (db: DB, databaseId: number, name: string): Promise<Tag> => {
    const id = Date.now();
    db.run('INSERT INTO tags (id, database_id, name) VALUES (?, ?, ?)', [id, databaseId, name]);
    saveDbToLocalStorage(db);
    return { id, database_id: databaseId, name };
};

export const updateTag = async (db: DB, tag: Tag) => {
    db.run('UPDATE tags SET name = ? WHERE id = ?', [tag.name, tag.id]);
    saveDbToLocalStorage(db);
};

export const updateTagWithRelations = async (db: DB, tagData: any) => {
    db.run('UPDATE tags SET name = ? WHERE id = ?', [tagData.name, tagData.id]);

    // Update subscriber relations
    db.run('DELETE FROM subscriber_tags WHERE tag_id = ?', [tagData.id]);
    tagData.subscribers.forEach((subId: number) => {
        db.run('INSERT INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)', [subId, tagData.id]);
    });

    const activeDbId = getActiveDbId();
    if (activeDbId) {
        const campaigns = await getDatabaseContents(db, activeDbId).then(d => d.campaigns);
        campaigns.forEach(c => {
            if (c.status !== 'Draft') return;
            const hasTag = c.target.tags.includes(tagData.id);
            const shouldHaveTag = tagData.campaigns.includes(c.id);
            if (hasTag && !shouldHaveTag) {
                const newTags = c.target.tags.filter(t => t !== tagData.id);
                db.run('UPDATE campaigns SET target_tags_json = ? WHERE id = ?', [JSON.stringify(newTags), c.id]);
            }
            if (!hasTag && shouldHaveTag) {
                const newTags = [...c.target.tags, tagData.id];
                db.run('UPDATE campaigns SET target_tags_json = ? WHERE id = ?', [JSON.stringify(newTags), c.id]);
            }
        });
    }
    saveDbToLocalStorage(db);
};


export const deleteTag = async (db: DB, id: number) => {
    db.run('DELETE FROM tags WHERE id = ?', [id]);
    saveDbToLocalStorage(db);
};


export const addCampaign = async (db: DB, databaseId: number, camp: Omit<Campaign, 'id'>): Promise<Campaign> => {
    const id = Date.now();
    const newCampaign = { ...camp, id };
    db.run(`INSERT INTO campaigns (id, database_id, subject, body, sent_at, recipient_count, status, target_tags_json, target_logic, recipients_json) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, databaseId, camp.subject, camp.body, camp.sent_at, camp.recipient_count, camp.status, JSON.stringify(camp.target.tags), camp.target.logic, JSON.stringify(camp.recipients)]
    );
    saveDbToLocalStorage(db);
    return newCampaign;
};

export const updateCampaign = async (db: DB, camp: Campaign) => {
    db.run(`UPDATE campaigns SET subject=?, body=?, sent_at=?, recipient_count=?, status=?, target_tags_json=?, target_logic=?, recipients_json=? WHERE id=?`,
        [camp.subject, camp.body, camp.sent_at, camp.recipient_count, camp.status, JSON.stringify(camp.target.tags), camp.target.logic, JSON.stringify(camp.recipients), camp.id]
    );
    saveDbToLocalStorage(db);
};

export const deleteCampaign = async (db: DB, id: number) => {
    db.run('DELETE FROM campaigns WHERE id = ?', [id]);
    saveDbToLocalStorage(db);
};

export const unlinkTagFromSubscriber = async (db: DB, subscriberId: number, tagId: number) => {
    db.run('DELETE FROM subscriber_tags WHERE subscriber_id = ? AND tag_id = ?', [subscriberId, tagId]);
    saveDbToLocalStorage(db);
};

// --- BULK OPERATIONS ---
export const bulkDeleteSubscribers = async (db: DB, subscriberIds: number[]): Promise<number> => {
    if (subscriberIds.length === 0) return 0;
    const placeholders = subscriberIds.map(() => '?').join(',');
    db.run(`DELETE FROM subscribers WHERE id IN (${placeholders})`, subscriberIds);
    const changes = db.getRowsModified();
    if (changes > 0) saveDbToLocalStorage(db);
    return changes;
};

export const bulkSetSubscriberStatus = async (db: DB, subscriberIds: number[], isSubscribed: boolean): Promise<number> => {
    if (subscriberIds.length === 0) return 0;
    const unsubscribed_at = isSubscribed ? null : new Date().toISOString();
    const placeholders = subscriberIds.map(() => '?').join(',');
    db.run(`UPDATE subscribers SET unsubscribed_at = ? WHERE id IN (${placeholders})`, [unsubscribed_at, ...subscriberIds]);
    const changes = db.getRowsModified();
    if (changes > 0) saveDbToLocalStorage(db);
    return changes;
};

export const bulkAddTagsToSubscribers = async (db: DB, subscriberIds: number[], tagIds: number[]): Promise<number> => {
    if (subscriberIds.length === 0 || tagIds.length === 0) return 0;
    let totalChanges = 0;
    const stmt = db.prepare('INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)');
    db.exec('BEGIN TRANSACTION');
    try {
        for (const subId of subscriberIds) {
            for (const tagId of tagIds) {
                stmt.run([subId, tagId]);
                totalChanges += db.getRowsModified();
            }
        }
        db.exec('COMMIT');
    } catch (e) {
        db.exec('ROLLBACK');
        console.error("Bulk tag add transaction failed:", e);
        throw e;
    } finally {
        stmt.free();
    }
    if (totalChanges > 0) saveDbToLocalStorage(db);
    return totalChanges;
};

export const bulkRemoveTagsFromSubscribers = async (db: DB, subscriberIds: number[], tagIds: number[]): Promise<number> => {
    if (subscriberIds.length === 0 || tagIds.length === 0) return 0;
    const subPlaceholders = subscriberIds.map(() => '?').join(',');
    const tagPlaceholders = tagIds.map(() => '?').join(',');
    db.run(`DELETE FROM subscriber_tags WHERE subscriber_id IN (${subPlaceholders}) AND tag_id IN (${tagPlaceholders})`, [...subscriberIds, ...tagIds]);
    const changes = db.getRowsModified();
    if (changes > 0) saveDbToLocalStorage(db);
    return changes;
};

// --- ADVANCED OPERATIONS ---

/**
 * A robust, state-machine-based CSV parser that handles quoted fields,
 * escaped quotes, and newlines within fields.
 * @param csvText The full raw string of the CSV file.
 * @returns An object containing the header array and an array of row arrays.
 */
function parseCSV(csvText: string): { header: string[], rows: string[][] } {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    // Handle potential UTF-8 BOM (Byte Order Mark) from some editors like Excel
    if (csvText.charCodeAt(0) === 0xFEFF) {
        csvText = csvText.substring(1);
    }
    // Normalize line endings
    csvText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                // This is an escaped quote ("")
                currentField += '"';
                i++; // Skip the next quote
            } else if (char === '"') {
                // End of quoted field
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentField);
                currentField = '';
            } else if (char === '\n') {
                currentRow.push(currentField);
                rows.push(currentRow);
                currentRow = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }
    }

    // Add the final field and row if the file doesn't end with a newline
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    
    // Filter out potential empty final row
    const nonEmptyRows = rows.filter(row => row.length > 1 || (row.length === 1 && row[0] !== ''));
    const header = nonEmptyRows.shift()?.map(h => h.toLowerCase().trim()) || [];

    return { header, rows: nonEmptyRows };
}


export const importSubscribersFromCSV = async (db: DB, databaseId: number, csvText: string): Promise<{ success: number, failed: number }> => {
    const { header, rows: dataRows } = parseCSV(csvText);
    
    if (dataRows.length === 0) {
        return { success: 0, failed: 0 };
    }

    const emailIndex = header.indexOf('email');
    if (emailIndex === -1) throw new Error("CSV must contain an 'email' column.");

    const nameIndex = header.indexOf('name');
    const externalIdIndex = header.indexOf('external_id');
    const tagsIndex = header.indexOf('tags');
    const unsubscribedAtIndex = header.indexOf('unsubscribed_at');

    let success = 0;
    let failed = 0;

    // Step 1: Pre-process and create all necessary tags
    const allCsvTags = new Set<string>();
    if (tagsIndex !== -1) {
        dataRows.forEach(values => {
            if (values.length > tagsIndex && values[tagsIndex]) {
                try {
                    const tagNames: string[] = JSON.parse(values[tagsIndex]);
                    if (Array.isArray(tagNames)) {
                        tagNames.forEach(tagName => {
                            if (typeof tagName === 'string') {
                                allCsvTags.add(tagName.trim());
                            }
                        });
                    }
                } catch (e) {
                    // Ignore malformed JSON during this pre-processing step
                }
            }
        });
    }
    
    const tagsStmt = db.prepare('SELECT id, name FROM tags WHERE database_id = ?');
    const existingTags: Tag[] = parseResults(tagsStmt.bind([databaseId]));
    const tagMap = new Map(existingTags.map(t => [t.name.toLowerCase(), t.id]));
    
    const newTagsToCreate: string[] = [];
    allCsvTags.forEach(tagName => {
        if (tagName && !tagMap.has(tagName.toLowerCase())) {
            newTagsToCreate.push(tagName);
        }
    });

    if (newTagsToCreate.length > 0) {
        db.exec('BEGIN TRANSACTION');
        try {
            const insertTagStmt = db.prepare('INSERT INTO tags (database_id, name) VALUES (?, ?)');
            newTagsToCreate.forEach(tagName => {
                insertTagStmt.run(databaseId, tagName);
            });
            insertTagStmt.free();
            db.exec('COMMIT');
        } catch (e) {
            db.exec('ROLLBACK');
            console.error("Failed to create new tags:", e);
            throw new Error("Could not create new tags during import.");
        }
        
        // Refresh the tag map with the newly created tags
        const allTagsStmt = db.prepare('SELECT id, name FROM tags WHERE database_id = ?');
        const allTags: Tag[] = parseResults(allTagsStmt.bind([databaseId]));
        allTags.forEach(t => {
            if (!tagMap.has(t.name.toLowerCase())) {
                tagMap.set(t.name.toLowerCase(), t.id);
            }
        });
    }

    // Step 2: Process subscribers in a single transaction for performance and safety
    db.exec('BEGIN TRANSACTION');
    try {
        const upsertSubStmt = db.prepare(`
            INSERT INTO subscribers (database_id, email, name, external_id, unsubscribed_at, subscribed_at) 
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(database_id, email) DO UPDATE SET 
                name=excluded.name, 
                external_id=excluded.external_id,
                unsubscribed_at=excluded.unsubscribed_at
        `);
        const selectSubIdStmt = db.prepare('SELECT id FROM subscribers WHERE database_id = ? AND email = ?');
        const clearTagsStmt = db.prepare('DELETE FROM subscriber_tags WHERE subscriber_id = ?');
        const linkTagStmt = db.prepare('INSERT INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)');

        for (const values of dataRows) {
            if (values.length <= emailIndex) {
                failed++;
                continue;
            }
            const email = values[emailIndex]?.trim();
            if (!email) {
                failed++;
                continue;
            }

            const name = (values.length > nameIndex && values[nameIndex]?.trim()) || email;
            const externalId = (values.length > externalIdIndex && values[externalIdIndex]?.trim()) || null;
            const unsubscribedAt = (unsubscribedAtIndex > -1 && values[unsubscribedAtIndex]?.trim()) || null;

            upsertSubStmt.run(databaseId, email, name, externalId, unsubscribedAt, new Date().toISOString().split('T')[0]);
            
            const subResult = selectSubIdStmt.get([databaseId, email]);
            if (!subResult || !subResult[0]) {
                failed++;
                continue;
            }
            const subscriberId = subResult[0];
            selectSubIdStmt.reset();

            // This is the crucial "upsert" step: clear old tags before adding new ones.
            clearTagsStmt.run(subscriberId);

            if (tagsIndex !== -1 && values.length > tagsIndex && values[tagsIndex]) {
                 try {
                    const tagNames: string[] = JSON.parse(values[tagsIndex]);
                    if (Array.isArray(tagNames)) {
                        for (const tagName of tagNames) {
                            const tagId = tagMap.get(tagName.trim().toLowerCase());
                            if (tagId) {
                               linkTagStmt.run(subscriberId, tagId);
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`Could not parse tags for ${email}:`, values[tagsIndex], e);
                }
            }
            success++;
        }

        upsertSubStmt.free();
        selectSubIdStmt.free();
        clearTagsStmt.free();
        linkTagStmt.free();
        db.exec('COMMIT');
    } catch(e) {
        db.exec('ROLLBACK');
        console.error("CSV Import Transaction Failed:", e);
        throw e;
    }

    saveDbToLocalStorage(db);
    return { success, failed };
};

interface TransferPayload {
    sourceDbId: number;
    targetDbId: number;
    subscriberIds: number[];
    mode: 'copy' | 'move';
}

export const transferSubscribers = async (db: DB, payload: TransferPayload) => {
    const { sourceDbId, targetDbId, subscriberIds, mode } = payload;
    if (subscriberIds.length === 0) return;

    const placeholders = subscriberIds.map(() => '?').join(',');
    
    // 1. Get source subscribers and their tags
    const subsStmt = db.prepare(`SELECT * FROM subscribers WHERE id IN (${placeholders})`);
    const subsToTransfer = parseResults(subsStmt.bind(subscriberIds));
    
    const tagsStmt = db.prepare(`SELECT st.subscriber_id, t.name as tag_name FROM subscriber_tags st JOIN tags t ON st.tag_id = t.id WHERE st.subscriber_id IN (${placeholders})`);
    const tagLinks = parseResults(tagsStmt.bind(subscriberIds));

    const subTagsMap = new Map<number, string[]>();
    tagLinks.forEach(link => {
        if (!subTagsMap.has(link.subscriber_id)) {
            subTagsMap.set(link.subscriber_id, []);
        }
        subTagsMap.get(link.subscriber_id)!.push(link.tag_name);
    });

    // 2. Get existing tags in target DB to avoid duplicates
    const targetTagsStmt = db.prepare('SELECT id, name FROM tags WHERE database_id = ?');
    const existingTargetTags: Tag[] = parseResults(targetTagsStmt.bind([targetDbId]));
    const targetTagsMap = new Map(existingTargetTags.map(t => [t.name.toLowerCase(), t.id]));

    db.exec('BEGIN TRANSACTION');
    try {
        for (const sub of subsToTransfer) {
            // 3. Insert or Move Subscriber
            let newSubId = sub.id;
            if (mode === 'copy') {
                const subResult = db.prepare(`INSERT INTO subscribers (database_id, email, name, subscribed_at, unsubscribed_at) VALUES (?, ?, ?, ?, ?) RETURNING id`);
                newSubId = parseResults(subResult.bind([targetDbId, sub.email, sub.name, sub.subscribed_at, sub.unsubscribed_at]))[0].id;
            } else { // move
                db.run('UPDATE subscribers SET database_id = ? WHERE id = ?', [targetDbId, sub.id]);
            }

            // 4. Handle tags for the new subscriber
            const subTagNames = subTagsMap.get(sub.id) || [];
            for (const tagName of subTagNames) {
                let tagId = targetTagsMap.get(tagName.toLowerCase());
                if (!tagId) {
                    // Create tag in target DB if it doesn't exist
                    const tagResult = db.prepare('INSERT INTO tags (database_id, name) VALUES (?, ?) RETURNING id');
                    tagId = parseResults(tagResult.bind([targetDbId, tagName]))[0].id;
                    targetTagsMap.set(tagName.toLowerCase(), tagId);
                }
                // Link subscriber to tag
                db.run('INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)', [newSubId, tagId]);
            }
        }
        db.exec('COMMIT');
    } catch (e) {
        db.exec('ROLLBACK');
        console.error("Transaction failed:", e);
        throw e;
    }

    saveDbToLocalStorage(db);
};