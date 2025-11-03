import { MOCK_SUBSCRIBERS, MOCK_TAGS, MOCK_CAMPAIGNS } from '../constants';
import { Database, Subscriber, Tag, Campaign, SocialLink, TagGroup, AppSubscriber as AppSubscriberType, TagLogic, SchemaComparisonReport, TableDiff, ColumnDiff } from '../types';

declare const initSqlJs: (config?: any) => Promise<any>;

export type DB = any;
type AppSubscriber = AppSubscriberType;

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

// Master schema definition. This is the single source of truth for the database structure.
const SCHEMA_DEFINITIONS: { [tableName: string]: { createSql: string, columns: { name: string, type: string }[] } } = {
    'databases': {
        createSql: `CREATE TABLE databases (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, logo_base64 TEXT, street TEXT, city TEXT, state TEXT, zip_code TEXT, county TEXT, website TEXT, phone TEXT, fax_number TEXT, social_links_json TEXT, key_contact_name TEXT, key_contact_phone TEXT, key_contact_email TEXT)`,
        columns: [
            { name: 'id', type: 'INTEGER' }, { name: 'name', type: 'TEXT' }, { name: 'description', type: 'TEXT' },
            { name: 'logo_base64', type: 'TEXT' }, { name: 'street', type: 'TEXT' }, { name: 'city', type: 'TEXT' },
            { name: 'state', type: 'TEXT' }, { name: 'zip_code', type: 'TEXT' }, { name: 'county', type: 'TEXT' },
            { name: 'website', type: 'TEXT' }, { name: 'phone', type: 'TEXT' }, { name: 'fax_number', type: 'TEXT' },
            { name: 'social_links_json', type: 'TEXT' }, { name: 'key_contact_name', type: 'TEXT' },
            { name: 'key_contact_phone', type: 'TEXT' }, { name: 'key_contact_email', type: 'TEXT' }
        ]
    },
    'subscribers': {
        createSql: `CREATE TABLE subscribers (id INTEGER PRIMARY KEY, database_id INTEGER NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL, subscribed_at TEXT NOT NULL, external_id TEXT, UNIQUE(database_id, email), FOREIGN KEY(database_id) REFERENCES databases(id) ON DELETE CASCADE)`,
        columns: [
            { name: 'id', type: 'INTEGER' }, { name: 'database_id', type: 'INTEGER' }, { name: 'email', type: 'TEXT' },
            { name: 'name', type: 'TEXT' }, { name: 'subscribed_at', type: 'TEXT' }, { name: 'external_id', type: 'TEXT' }
        ]
    },
    'tags': {
        createSql: `CREATE TABLE tags (id INTEGER PRIMARY KEY, database_id INTEGER NOT NULL, name TEXT NOT NULL, UNIQUE(database_id, name), FOREIGN KEY(database_id) REFERENCES databases(id) ON DELETE CASCADE)`,
        columns: [
            { name: 'id', type: 'INTEGER' }, { name: 'database_id', type: 'INTEGER' }, { name: 'name', type: 'TEXT' }
        ]
    },
    'campaigns': {
        createSql: `CREATE TABLE campaigns (id INTEGER PRIMARY KEY, database_id INTEGER NOT NULL, subject TEXT NOT NULL, body TEXT, sent_at TEXT, scheduled_at TEXT, recipient_count INTEGER, status TEXT NOT NULL, recipients_json TEXT, target_groups_json TEXT, FOREIGN KEY(database_id) REFERENCES databases(id) ON DELETE CASCADE)`,
        columns: [
            { name: 'id', type: 'INTEGER' }, { name: 'database_id', type: 'INTEGER' }, { name: 'subject', type: 'TEXT' },
            { name: 'body', type: 'TEXT' }, { name: 'sent_at', type: 'TEXT' }, { name: 'scheduled_at', type: 'TEXT' },
            { name: 'recipient_count', type: 'INTEGER' }, { name: 'status', type: 'TEXT' }, { name: 'recipients_json', type: 'TEXT' },
            { name: 'target_groups_json', type: 'TEXT' }
        ]
    },
    'subscriber_tags': {
        createSql: `CREATE TABLE subscriber_tags (subscriber_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY(subscriber_id, tag_id), FOREIGN KEY(subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE, FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE)`,
        columns: [
            { name: 'subscriber_id', type: 'INTEGER' }, { name: 'tag_id', type: 'INTEGER' }
        ]
    }
};

const runMigrations = (db: DB) => {
    db.exec('BEGIN TRANSACTION;');
    try {
        const getExistingTables = () => {
            const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
            const tables = new Set<string>();
            while (stmt.step()) {
                tables.add(stmt.get()[0]);
            }
            stmt.free();
            return tables;
        };

        const existingTables = getExistingTables();

        for (const tableName in SCHEMA_DEFINITIONS) {
            if (!existingTables.has(tableName)) {
                console.log(`Migration: Creating table ${tableName}...`);
                db.exec(SCHEMA_DEFINITIONS[tableName].createSql);
            }
        }
        
        for (const tableName in SCHEMA_DEFINITIONS) {
            const tableInfoRes = db.exec(`PRAGMA table_info(${tableName});`);
            if (!tableInfoRes || tableInfoRes.length === 0) {
                console.warn(`Migration: Could not get info for table ${tableName}, skipping column check.`);
                continue;
            }
            const existingColumns = new Set(tableInfoRes[0].values.map((col: any) => col[1]));
            
            for (const columnDef of SCHEMA_DEFINITIONS[tableName].columns) {
                if (!existingColumns.has(columnDef.name)) {
                    console.log(`Migration: Adding column ${columnDef.name} to ${tableName}...`);
                    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef.name} ${columnDef.type};`);
                }
            }
        }

        const campaignsTableInfo = db.exec(`PRAGMA table_info(campaigns);`);
        const campaignsColumnsSet = new Set(campaignsTableInfo[0]?.values.map((col: any) => col[1]) || []);

        if (campaignsColumnsSet.has('target_tags_json') && campaignsColumnsSet.has('target_logic')) {
            const oldCampaignsStmt = db.prepare("SELECT id, target_tags_json, target_logic FROM campaigns WHERE status = 'Draft' AND (target_groups_json IS NULL OR target_groups_json = '[]') AND (target_tags_json IS NOT NULL AND target_tags_json != '[]')");
            const campaignsToMigrate = parseResults(oldCampaignsStmt);
            if (campaignsToMigrate.length > 0) {
                console.log(`Migration: Found ${campaignsToMigrate.length} old campaign targets to migrate.`);
                const updateStmt = db.prepare("UPDATE campaigns SET target_groups_json = ? WHERE id = ?");
                campaignsToMigrate.forEach((c: any) => {
                    try {
                        const tags = JSON.parse(c.target_tags_json);
                        if (Array.isArray(tags) && tags.length > 0) {
                            const newTarget = { groups: [{ id: `migrated-${c.id}`, tags: tags, logic: c.target_logic || 'ANY', atLeast: 1 }], groupsLogic: 'AND' };
                            updateStmt.run([JSON.stringify(newTarget), c.id]);
                        }
                    } catch (e) { console.error(`Could not migrate campaign target for id ${c.id}`, e); }
                });
                updateStmt.free();
            }
        }

        const arrayTargetCampaignsStmt = db.prepare("SELECT id, target_groups_json FROM campaigns WHERE json_type(target_groups_json) = 'array'");
        const arrayCampaignsToMigrate = parseResults(arrayTargetCampaignsStmt);
        if (arrayCampaignsToMigrate.length > 0) {
             console.log(`Migration: Found ${arrayCampaignsToMigrate.length} array-based campaign targets to migrate to object-based.`);
             const updateStmt = db.prepare("UPDATE campaigns SET target_groups_json = ? WHERE id = ?");
             arrayCampaignsToMigrate.forEach((c: any) => {
                try {
                    const groups = JSON.parse(c.target_groups_json);
                    const newTarget = { groups: groups, groupsLogic: 'AND' };
                    updateStmt.run([JSON.stringify(newTarget), c.id]);
                } catch(e) { console.error(`Could not migrate array campaign target for id ${c.id}`, e) }
             });
             updateStmt.free();
        }

        db.exec('COMMIT;');
    } catch (e) {
        console.error("Database migration failed, rolling back.", e);
        db.exec('ROLLBACK;');
        throw e;
    }
}


const createAndSeedDatabase = (sql: any): DB => {
    const db = new sql.Database();
    const fullSchema = Object.values(SCHEMA_DEFINITIONS).map(def => def.createSql).join('; ');
    db.exec(fullSchema);

    const dbId = 1; // Use a predictable ID for the seed
    db.run('INSERT INTO databases (id, name, description) VALUES (?, ?, ?)', [ dbId, 'Default Newsletter', 'Auto-generated starter database' ]);

    MOCK_TAGS.forEach(tag => db.run('INSERT OR IGNORE INTO tags (id, database_id, name) VALUES (?, ?, ?)', [tag.id, dbId, tag.name]));
    MOCK_SUBSCRIBERS.forEach(sub => {
        db.run('INSERT OR IGNORE INTO subscribers (id, database_id, email, name, subscribed_at) VALUES (?, ?, ?, ?, ?)', [ sub.id, dbId, sub.email, sub.name, sub.subscribed_at ]);
        sub.tags.forEach(tagId => db.run('INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)', [sub.id, tagId]));
    });
    MOCK_CAMPAIGNS.forEach(camp => {
        db.run(`INSERT INTO campaigns (id, database_id, subject, body, sent_at, scheduled_at, recipient_count, status, target_groups_json, recipients_json) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [camp.id, dbId, camp.subject, camp.body, camp.sent_at, camp.scheduled_at, camp.recipient_count, camp.status, JSON.stringify(camp.target), JSON.stringify(camp.recipients)]
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
            runMigrations(db);
            saveDbToLocalStorage(db);
        } catch (e) {
            console.error("Failed to load DB from localStorage, creating new one.", e);
            localStorage.removeItem(DB_LOCAL_STORAGE_KEY);
            db = createAndSeedDatabase(sql);
            saveDbToLocalStorage(db);
        }
    } else {
        db = createAndSeedDatabase(sql);
        saveDbToLocalStorage(db);
    }
    return db;
};

export const createBlankDb = () => {
    if (!SQL) throw new Error("SQL.js not initialized");
    const db = new SQL.Database();
    const fullSchema = Object.values(SCHEMA_DEFINITIONS).map(def => def.createSql).join('; ');
    db.exec(fullSchema);
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
    if (id === null) localStorage.removeItem(ACTIVE_DB_ID_KEY);
    else localStorage.setItem(ACTIVE_DB_ID_KEY, JSON.stringify(id));
};

export const getActiveDbId = (): number | null => {
    const id = localStorage.getItem(ACTIVE_DB_ID_KEY);
    return id ? JSON.parse(id) : null;
};

const parseResults = (stmt: any): any[] => {
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
};


// --- READ OPERATIONS ---

export const getDatabases = async (db: DB): Promise<Omit<Database, 'subscribers'|'tags'|'campaigns'>[]> => {
    const stmt = db.prepare('SELECT * FROM databases');
    return parseResults(stmt).map(dbRow => ({
        ...dbRow,
        social_links: JSON.parse(dbRow.social_links_json || '[]'),
    }));
};

const parseCampaignTarget = (jsonString: string | null): Campaign['target'] => {
    const defaultTarget: Campaign['target'] = { groups: [], groupsLogic: 'AND' };
    if (!jsonString) return defaultTarget;
    try {
        const parsed = JSON.parse(jsonString);
        // Handle legacy format where target_groups_json was just an array of groups
        if (Array.isArray(parsed)) {
            return { groups: parsed, groupsLogic: 'AND' };
        }
        // Handle new object format
        if (typeof parsed === 'object' && parsed !== null) {
            return {
                groups: parsed.groups || [],
                groupsLogic: parsed.groupsLogic || 'AND'
            };
        }
    } catch (e) {
        console.warn("Could not parse campaign target JSON:", jsonString, e);
    }
    return defaultTarget;
};


export const getDatabaseContents = async (db: DB, databaseId: number): Promise<Database> => {
    const dbInfoStmt = db.prepare('SELECT * FROM databases WHERE id = :id');
    dbInfoStmt.bind({ ':id': databaseId });
    const dbInfoResult = parseResults(dbInfoStmt)[0];
    if (!dbInfoResult) throw new Error("Database not found");
    
    const dbInfo = { ...dbInfoResult, social_links: JSON.parse(dbInfoResult.social_links_json || '[]') };

    const subsStmt = db.prepare('SELECT * FROM subscribers WHERE database_id = :id');
    subsStmt.bind({ ':id': databaseId });
    const subscribers: AppSubscriber[] = parseResults(subsStmt).map((s: Subscriber) => ({ ...s, tags: [] }));

    const tagsStmt = db.prepare('SELECT * FROM tags WHERE database_id = :id');
    tagsStmt.bind({ ':id': databaseId });
    const tags: Tag[] = parseResults(tagsStmt);

    const subTagsStmt = db.prepare(`SELECT st.subscriber_id, st.tag_id FROM subscriber_tags st JOIN subscribers s ON s.id = st.subscriber_id WHERE s.database_id = :id`);
    subTagsStmt.bind({ ':id': databaseId });
    const subTags = parseResults(subTagsStmt);
    
    const subMap = new Map(subscribers.map(s => [s.id, s]));
    subTags.forEach(st => subMap.get(st.subscriber_id)?.tags.push(st.tag_id));

    const campaignsStmt = db.prepare('SELECT * FROM campaigns WHERE database_id = :id ORDER BY id DESC');
    campaignsStmt.bind({ ':id': databaseId });
    const campaigns: Campaign[] = parseResults(campaignsStmt).map((c: any) => ({
        ...c,
        recipients: JSON.parse(c.recipients_json || '[]'),
        target: parseCampaignTarget(c.target_groups_json),
    }));
    
    return { ...dbInfo, subscribers, tags, campaigns };
}

export const getDueCampaigns = async (db: DB, databaseId: number): Promise<Campaign[]> => {
    const stmt = db.prepare('SELECT * FROM campaigns WHERE database_id = :dbId AND status = "Scheduled" AND scheduled_at <= :now');
    stmt.bind({ ':dbId': databaseId, ':now': new Date().toISOString() });
    return parseResults(stmt).map((c: any) => ({
        ...c,
        recipients: JSON.parse(c.recipients_json || '[]'),
        target: parseCampaignTarget(c.target_groups_json),
    }));
};

// --- WRITE OPERATIONS ---

type DatabaseProfileData = Omit<Database, 'id' | 'subscribers' | 'tags' | 'campaigns'>;

export const addDatabase = async (db: DB, data: DatabaseProfileData): Promise<{ id: number }> => {
    const id = Date.now();
    db.run(`INSERT INTO databases (id, name, description, logo_base64, website, phone, social_links_json, street, city, state, zip_code, county, fax_number, key_contact_name, key_contact_phone, key_contact_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [ id, data.name, data.description, data.logo_base64 || null, data.website || null, data.phone || null, JSON.stringify(data.social_links || []), data.street || null, data.city || null, data.state || null, data.zip_code || null, data.county || null, data.fax_number || null, data.key_contact_name || null, data.key_contact_phone || null, data.key_contact_email || null ]);
    saveDbToLocalStorage(db);
    return { id };
};

export const updateDatabase = async (db: DB, data: Omit<Database, 'subscribers' | 'tags' | 'campaigns'>) => {
    db.run(`UPDATE databases SET name = ?, description = ?, logo_base64 = ?, website = ?, phone = ?, social_links_json = ?, street = ?, city = ?, state = ?, zip_code = ?, county = ?, fax_number = ?, key_contact_name = ?, key_contact_phone = ?, key_contact_email = ? WHERE id = ?`,
        [ data.name, data.description, data.logo_base64 || null, data.website || null, data.phone || null, JSON.stringify(data.social_links || []), data.street || null, data.city || null, data.state || null, data.zip_code || null, data.county || null, data.fax_number || null, data.key_contact_name || null, data.key_contact_phone || null, data.key_contact_email || null, data.id ]);
    saveDbToLocalStorage(db);
};

export const deleteDatabase = async (db: DB, id: number) => {
    db.run('DELETE FROM databases WHERE id = ?', [id]);
    saveDbToLocalStorage(db);
}

export const addSubscriber = async (db: DB, databaseId: number, sub: Omit<AppSubscriber, 'id' | 'subscribed_at'>): Promise<Subscriber> => {
    const id = Date.now();
    const subscribed_at = new Date().toISOString().split('T')[0];
    db.run('INSERT INTO subscribers (id, database_id, email, name, subscribed_at, external_id) VALUES (?, ?, ?, ?, ?, ?)', [ id, databaseId, sub.email, sub.name, subscribed_at, sub.external_id || null ]);
    sub.tags.forEach(tagId => db.run('INSERT INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)', [id, tagId]));
    saveDbToLocalStorage(db);
    return { ...sub, id, subscribed_at };
};

export const updateSubscriber = async (db: DB, sub: AppSubscriber) => {
    db.run('UPDATE subscribers SET name = ?, email = ?, external_id = ? WHERE id = ?', [sub.name, sub.email, sub.external_id || null, sub.id]);
    db.run('DELETE FROM subscriber_tags WHERE subscriber_id = ?', [sub.id]);
    sub.tags.forEach(tagId => db.run('INSERT INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)', [sub.id, tagId]));
    saveDbToLocalStorage(db);
};

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
    db.run('DELETE FROM subscriber_tags WHERE tag_id = ?', [tagData.id]);
    tagData.subscribers.forEach((subId: number) => db.run('INSERT INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)', [subId, tagData.id]));

    const activeDbId = getActiveDbId();
    if (activeDbId) {
        const campaigns = await getDatabaseContents(db, activeDbId).then(d => d.campaigns);
        campaigns.forEach(c => {
            if (c.status !== 'Draft') return;
            const hasTag = c.target.groups?.some(g => g.tags.includes(tagData.id));
            const shouldHaveTag = tagData.campaigns.includes(c.id);
            if (!c.target.groups) c.target.groups = [];
            if (hasTag && !shouldHaveTag) {
                const newGroups = c.target.groups.map(g => ({ ...g, tags: g.tags.filter(t => t !== tagData.id) }));
                db.run('UPDATE campaigns SET target_groups_json = ? WHERE id = ?', [JSON.stringify({...c.target, groups: newGroups}), c.id]);
            }
            if (!hasTag && shouldHaveTag) {
                const newGroups = [...c.target.groups];
                if (newGroups.length === 0) newGroups.push({ id: `new-${c.id}`, tags: [], logic: 'ANY'});
                newGroups[0].tags.push(tagData.id);
                db.run('UPDATE campaigns SET target_groups_json = ? WHERE id = ?', [JSON.stringify({...c.target, groups: newGroups}), c.id]);
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
    db.run(`INSERT INTO campaigns (id, database_id, subject, body, sent_at, scheduled_at, recipient_count, status, recipients_json, target_groups_json) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, databaseId, camp.subject, camp.body, camp.sent_at, camp.scheduled_at, camp.recipient_count, camp.status, JSON.stringify(camp.recipients), JSON.stringify(camp.target)]
    );
    saveDbToLocalStorage(db);
    return newCampaign;
};

export const updateCampaign = async (db: DB, camp: Campaign) => {
    db.run(`UPDATE campaigns SET subject=?, body=?, sent_at=?, scheduled_at=?, recipient_count=?, status=?, recipients_json=?, target_groups_json=? WHERE id=?`,
        [camp.subject, camp.body, camp.sent_at, camp.scheduled_at, camp.recipient_count, camp.status, JSON.stringify(camp.recipients), JSON.stringify(camp.target), camp.id]
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


// --- ADVANCED OPERATIONS & CSV HANDLING ---
export const getRecipientIds = (target: Campaign['target'], subscribers: AppSubscriber[]): number[] => {
    const { groups, groupsLogic } = target;

    if (groups.length === 0 || groups.every(g => g.tags.length === 0)) {
        return subscribers.map(s => s.id);
    }
    
    const combineFn = groupsLogic === 'OR' ? 'some' : 'every';
    
    return subscribers
        .filter(sub => {
            const subTags = new Set(sub.tags);
            return groups[combineFn]((group: TagGroup) => {
                if (group.tags.length === 0) return true;
                
                const intersectionCount = group.tags.filter(tagId => subTags.has(tagId)).length;

                switch (group.logic) {
                    case 'ANY': return intersectionCount > 0;
                    case 'ALL': return intersectionCount === group.tags.length;
                    case 'NONE': return intersectionCount === 0;
                    case 'AT_LEAST': return intersectionCount >= (group.atLeast || 1);
                    default: return false;
                }
            });
        })
        .map(s => s.id);
};

export const downloadFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const escapeCsvField = (field: any): string => {
  const str = String(field ?? '');
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

export const generateCsvContent = (headers: string[], rows: any[][]): string => {
    const headerRow = headers.map(escapeCsvField).join(',');
    const contentRows = rows.map(row => row.map(escapeCsvField).join(','));
    return [headerRow, ...contentRows].join('\n');
}

function parseCSV(csvText: string): { header: string[], rows: string[][] } {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.substring(1);
    csvText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];
        if (inQuotes) {
            if (char === '"' && nextChar === '"') { currentField += '"'; i++; } 
            else if (char === '"') { inQuotes = false; } 
            else { currentField += char; }
        } else {
            if (char === '"') { inQuotes = true; } 
            else if (char === ',') { currentRow.push(currentField); currentField = ''; } 
            else if (char === '\n') { currentRow.push(currentField); rows.push(currentRow); currentRow = []; currentField = ''; } 
            else { currentField += char; }
        }
    }
    if (currentField || currentRow.length > 0) { currentRow.push(currentField); rows.push(currentRow); }
    
    const nonEmptyRows = rows.filter(row => row.length > 1 || (row.length === 1 && row[0] !== ''));
    const header = nonEmptyRows.shift()?.map(h => h.toLowerCase().trim()) || [];
    return { header, rows: nonEmptyRows };
}

export const importSubscribersFromCSV = async (db: DB, databaseId: number, csvText: string): Promise<{ success: number, failed: number }> => {
    const { header, rows: dataRows } = parseCSV(csvText);
    if (dataRows.length === 0) return { success: 0, failed: 0 };
    const emailIndex = header.indexOf('email');
    if (emailIndex === -1) throw new Error("CSV must contain an 'email' column.");

    const nameIndex = header.indexOf('name');
    const externalIdIndex = header.indexOf('external_id');
    const tagsIndex = header.indexOf('tags');
    let success = 0, failed = 0;

    const allCsvTags = new Set<string>();
    if (tagsIndex !== -1) {
        dataRows.forEach(values => {
            if (values.length > tagsIndex && values[tagsIndex]) {
                try {
                    const tagNames: string[] = JSON.parse(values[tagsIndex]);
                    if (Array.isArray(tagNames)) tagNames.forEach(tagName => { if (typeof tagName === 'string') allCsvTags.add(tagName.trim()); });
                } catch (e) {}
            }
        });
    }
    
    const tagsStmt = db.prepare('SELECT id, name FROM tags WHERE database_id = ?');
    tagsStmt.bind([databaseId]);
    const existingTags: Tag[] = parseResults(tagsStmt);
    const tagMap = new Map(existingTags.map(t => [t.name.toLowerCase(), t.id]));
    
    const newTagsToCreate: string[] = [];
    allCsvTags.forEach(tagName => { if (tagName && !tagMap.has(tagName.toLowerCase())) newTagsToCreate.push(tagName); });

    if (newTagsToCreate.length > 0) {
        db.exec('BEGIN TRANSACTION');
        try {
            const insertTagStmt = db.prepare('INSERT INTO tags (database_id, name) VALUES (?, ?)');
            newTagsToCreate.forEach(tagName => insertTagStmt.run(databaseId, tagName));
            insertTagStmt.free();
            db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); throw new Error("Could not create new tags during import."); }
        
        const allTagsStmt = db.prepare('SELECT id, name FROM tags WHERE database_id = ?');
        allTagsStmt.bind([databaseId]);
        const allTags: Tag[] = parseResults(allTagsStmt);
        allTags.forEach(t => { if (!tagMap.has(t.name.toLowerCase())) tagMap.set(t.name.toLowerCase(), t.id); });
    }

    db.exec('BEGIN TRANSACTION');
    try {
        const upsertSubStmt = db.prepare(`INSERT INTO subscribers (database_id, email, name, external_id, subscribed_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(database_id, email) DO UPDATE SET name=excluded.name, external_id=excluded.external_id`);
        const selectSubIdStmt = db.prepare('SELECT id FROM subscribers WHERE database_id = ? AND email = ?');
        const clearTagsStmt = db.prepare('DELETE FROM subscriber_tags WHERE subscriber_id = ?');
        const linkTagStmt = db.prepare('INSERT INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)');

        for (const values of dataRows) {
            if (values.length <= emailIndex) { failed++; continue; }
            const email = values[emailIndex]?.trim();
            if (!email) { failed++; continue; }
            const name = (values.length > nameIndex && values[nameIndex]?.trim()) || email;
            const externalId = (values.length > externalIdIndex && values[externalIdIndex]?.trim()) || null;

            upsertSubStmt.run(databaseId, email, name, externalId, new Date().toISOString().split('T')[0]);
            const subResult = selectSubIdStmt.get([databaseId, email]);
            if (!subResult || !subResult[0]) { failed++; continue; }
            const subscriberId = subResult[0];
            selectSubIdStmt.reset();
            clearTagsStmt.run(subscriberId);

            if (tagsIndex !== -1 && values.length > tagsIndex && values[tagsIndex]) {
                 try {
                    const tagNames: string[] = JSON.parse(values[tagsIndex]);
                    if (Array.isArray(tagNames)) {
                        for (const tagName of tagNames) {
                            const tagId = tagMap.get(tagName.trim().toLowerCase());
                            if (tagId) linkTagStmt.run(subscriberId, tagId);
                        }
                    }
                } catch (e) { console.warn(`Could not parse tags for ${email}:`, values[tagsIndex], e); }
            }
            success++;
        }
        upsertSubStmt.free(); selectSubIdStmt.free(); clearTagsStmt.free(); linkTagStmt.free();
        db.exec('COMMIT');
    } catch(e) { db.exec('ROLLBACK'); throw e; }

    saveDbToLocalStorage(db);
    return { success, failed };
};

interface TransferPayload { sourceDbId: number; targetDbId: number; subscriberIds: number[]; mode: 'copy' | 'move'; }

export const transferSubscribers = async (db: DB, payload: TransferPayload) => {
    const { sourceDbId, targetDbId, subscriberIds, mode } = payload;
    if (subscriberIds.length === 0) return;
    const placeholders = subscriberIds.map(() => '?').join(',');
    
    const subsStmt = db.prepare(`SELECT * FROM subscribers WHERE id IN (${placeholders})`);
    subsStmt.bind(subscriberIds);
    const subsToTransfer = parseResults(subsStmt);

    const tagsStmt = db.prepare(`SELECT st.subscriber_id, t.name as tag_name FROM subscriber_tags st JOIN tags t ON st.tag_id = t.id WHERE st.subscriber_id IN (${placeholders})`);
    tagsStmt.bind(subscriberIds);
    const tagLinks = parseResults(tagsStmt);

    const subTagsMap = new Map<number, string[]>();
    tagLinks.forEach(link => {
        if (!subTagsMap.has(link.subscriber_id)) subTagsMap.set(link.subscriber_id, []);
        subTagsMap.get(link.subscriber_id)!.push(link.tag_name);
    });

    const targetTagsStmt = db.prepare('SELECT id, name FROM tags WHERE database_id = ?');
    targetTagsStmt.bind([targetDbId]);
    const existingTargetTags: Tag[] = parseResults(targetTagsStmt);
    const targetTagsMap = new Map(existingTargetTags.map(t => [t.name.toLowerCase(), t.id]));

    db.exec('BEGIN TRANSACTION');
    try {
        for (const sub of subsToTransfer) {
            let newSubId = sub.id;
            if (mode === 'copy') {
                const subResult = db.prepare(`INSERT INTO subscribers (database_id, email, name, subscribed_at) VALUES (?, ?, ?, ?) RETURNING id`);
                subResult.bind([targetDbId, sub.email, sub.name, sub.subscribed_at]);
                newSubId = parseResults(subResult)[0].id;
            } else { db.run('UPDATE subscribers SET database_id = ? WHERE id = ?', [targetDbId, sub.id]); }

            const subTagNames = subTagsMap.get(sub.id) || [];
            for (const tagName of subTagNames) {
                let tagId = targetTagsMap.get(tagName.toLowerCase());
                if (!tagId) {
                    const tagResult = db.prepare('INSERT INTO tags (database_id, name) VALUES (?, ?) RETURNING id');
                    tagResult.bind([targetDbId, tagName]);
                    tagId = parseResults(tagResult)[0].id;
                    targetTagsMap.set(tagName.toLowerCase(), tagId);
                }
                db.run('INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)', [newSubId, tagId]);
            }
        }
        db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    saveDbToLocalStorage(db);
};

export const generateSeedSqlScript = (): string => {
    const escapeSql = (str: any) => {
        if (str === null || str === undefined) return 'NULL';
        return `'${String(str).replace(/'/g, "''")}'`;
    };
    
    let script = `-- WVVT Newsletter Platform Seed Script\n`;
    script += `-- Generated on: ${new Date().toISOString()}\n\n`;

    const tableNames = Object.keys(SCHEMA_DEFINITIONS);
    tableNames.forEach(name => script += `DROP TABLE IF EXISTS ${name};\n`);
    script += '\n';

    tableNames.forEach(name => script += `${SCHEMA_DEFINITIONS[name].createSql};\n`);
    script += '\n';
    
    script += `INSERT INTO databases (id, name, description) VALUES (1, 'Default Newsletter', 'Auto-generated starter database');\n\n`;
    
    MOCK_TAGS.forEach(tag => {
        script += `INSERT INTO tags (id, database_id, name) VALUES (${tag.id}, 1, ${escapeSql(tag.name)});\n`;
    });
    script += '\n';
    
    MOCK_SUBSCRIBERS.forEach(sub => {
        script += `INSERT INTO subscribers (id, database_id, email, name, subscribed_at) VALUES (${sub.id}, 1, ${escapeSql(sub.email)}, ${escapeSql(sub.name)}, ${escapeSql(sub.subscribed_at)});\n`;
        sub.tags.forEach(tagId => {
            script += `INSERT INTO subscriber_tags (subscriber_id, tag_id) VALUES (${sub.id}, ${tagId});\n`;
        });
    });
    script += '\n';

    MOCK_CAMPAIGNS.forEach(camp => {
        script += `INSERT INTO campaigns (id, database_id, subject, body, sent_at, scheduled_at, recipient_count, status, target_groups_json, recipients_json) VALUES (${camp.id}, 1, ${escapeSql(camp.subject)}, ${escapeSql(camp.body)}, ${escapeSql(camp.sent_at)}, ${escapeSql(camp.scheduled_at)}, ${camp.recipient_count}, ${escapeSql(camp.status)}, ${escapeSql(JSON.stringify(camp.target))}, ${escapeSql(JSON.stringify(camp.recipients))});\n`;
    });

    return script;
};

export const bulkDeleteItems = async (db: DB, tableName: string, ids: number[]): Promise<void> => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    const allowedTables = ['subscribers', 'tags', 'campaigns'];
    const cleanTableName = allowedTables.find(t => t.toLowerCase() === tableName.toLowerCase());
    if (!cleanTableName) throw new Error("Invalid table name for bulk delete.");

    db.run(`DELETE FROM ${cleanTableName} WHERE id IN (${placeholders})`, ids);
    saveDbToLocalStorage(db);
}

export const bulkUpdateSubscriberTags = async (
  db: DB,
  subscriberIds: number[],
  tagsToAdd: number[],
  tagsToRemove: number[],
  mode: 'add' | 'remove' | 'reset'
): Promise<void> => {
    if (subscriberIds.length === 0) return;

    db.exec('BEGIN TRANSACTION');
    try {
        const linkTagStmt = db.prepare('INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)');
        const unlinkTagStmt = db.prepare('DELETE FROM subscriber_tags WHERE subscriber_id = ? AND tag_id = ?');
        const resetTagsStmt = db.prepare('DELETE FROM subscriber_tags WHERE subscriber_id = ?');

        for (const subId of subscriberIds) {
            if (mode === 'reset') {
                resetTagsStmt.run(subId);
                for (const tagId of tagsToAdd) {
                    linkTagStmt.run([subId, tagId]);
                }
            } else {
                if (mode === 'add') {
                    for (const tagId of tagsToAdd) {
                        linkTagStmt.run([subId, tagId]);
                    }
                }
                if (mode === 'remove') {
                    for (const tagId of tagsToRemove) {
                        unlinkTagStmt.run([subId, tagId]);
                    }
                }
            }
        }

        linkTagStmt.free();
        unlinkTagStmt.free();
        resetTagsStmt.free();
        db.exec('COMMIT');
    } catch (e) {
        db.exec('ROLLBACK');
        console.error("Bulk tag update failed:", e);
        throw e;
    }
    saveDbToLocalStorage(db);
};

export const analyzeDatabaseSchema = async (db: DB): Promise<SchemaComparisonReport> => {
    const report: SchemaComparisonReport = { tables: [], extraTables: [] };
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const existingTables = new Set<string>();
    while(stmt.step()) existingTables.add(stmt.get()[0]);
    stmt.free();

    for (const tableName in SCHEMA_DEFINITIONS) {
        const def = SCHEMA_DEFINITIONS[tableName];
        const tableDiff: TableDiff = { name: tableName, isMissing: false, missingColumns: [], extraColumns: [] };
        if (!existingTables.has(tableName)) {
            tableDiff.isMissing = true;
            report.tables.push(tableDiff);
            continue;
        }

        const tableInfoRes = db.exec(`PRAGMA table_info(${tableName});`);
        const existingColumns = new Map<string, string>();
        if (tableInfoRes && tableInfoRes.length > 0) {
            tableInfoRes[0].values.forEach((col: any) => existingColumns.set(col[1], col[2]));
        }

        const definedColumns = new Set(def.columns.map(c => c.name));
        for (const colDef of def.columns) {
            if (!existingColumns.has(colDef.name)) {
                tableDiff.missingColumns.push({ name: colDef.name, expected: colDef.type, found: null });
            }
        }
        for (const [colName, colType] of existingColumns.entries()) {
            if (!definedColumns.has(colName)) {
                tableDiff.extraColumns.push(colName);
            }
        }
        report.tables.push(tableDiff);
    }
    
    for (const tableName of existingTables) {
        if (!SCHEMA_DEFINITIONS[tableName]) {
            report.extraTables.push(tableName);
        }
    }

    return report;
};