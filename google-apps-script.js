// ============================================================
//  GMAO Yacht — Google Apps Script Backend
//  Copiez ce code dans un projet Google Apps Script
//  (Extensions > Apps Script depuis votre Google Sheet)
// ============================================================

// ─── Configuration ───
// L'ID du dossier Google Drive pour les photos (créez un dossier et copiez l'ID depuis l'URL)
const DRIVE_FOLDER_ID = 'VOTRE_DRIVE_FOLDER_ID';

// ─── Helpers ───
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function sheetToJson(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      let val = row[i];
      // Parse JSON fields (arrays, objects, booleans)
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try { val = JSON.parse(val); } catch(e) {}
      }
      if (val === 'TRUE' || val === true) val = true;
      if (val === 'FALSE' || val === false) val = false;
      obj[h] = val;
    });
    return obj;
  });
}

function jsonToSheet(sheet, data, headers) {
  sheet.clear();
  if (!data || !data.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  const rows = data.map(obj =>
    headers.map(h => {
      const val = obj[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return val;
    })
  );
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

// ─── Schéma des onglets ───
const SCHEMAS = {
  vessels: ['id','nom','type','longueur','annee','port','immat','mmsi','callSign','statut','carenage','heures','img','photo'],
  equipage: ['id','nId','nom','role','tel','email','actif','numMarin','numPasseport','permanent','dateDebut','dateFin','photo','salaire','charges'],
  composants: ['id','nId','famille','sg','nom','marque','modele','serie','install','manuel','photos'],
  maint: ['id','nId','compId','cat','titre','prio','statut','echeance','dateFin','freq','cout','coutReel','assigneA','desc','justif','workflow','photos','recurrence','parentId','checklist','factures','datePaiement','statutPaiement'],
  couts: ['id','nId','cat','desc','montant','date','fournisseur','justif','chartId','maintId','crewCostId','datePaiement','statutPaiement'],
  inventaire: ['id','nId','ref','nom','cat','qte','seuil','fournisseur','emplacement','photos'],
  journal: ['id','nId','date','type','hm','mi','meteo','auteur','eq','texte','carb','photos'],
  documents: ['id','nId','nom','cat','echeance','statut','notes','fichier','fichierNom'],
  charters: ['id','nId','client','debut','fin','zone','apa','montant','statut','notes','brokers','cruisingArea','miseADispo'],
  apaDep: ['id','charterId','nId','desc','montant','date','cat','justif'],
  revenus: ['id','nId','type','desc','montant','date','chartId','datePaiement','statutPaiement'],
  reglementaire: ['id','nId','nom','cat','eauxFr','eauxEtr','echeance','statut','notes','fichier','fichierNom']
};

// ─── API Endpoints ───

function doGet(e) {
  const action = e.parameter.action || 'loadAll';
  let result;

  try {
    if (action === 'loadAll') {
      result = {};
      Object.keys(SCHEMAS).forEach(key => {
        result[key] = sheetToJson(getSheet(key));
      });
    } else {
      result = { error: 'Action inconnue: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'JSON invalide' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const action = body.action;
  let result;

  try {
    if (action === 'saveAll') {
      // Sauvegarde complète de toutes les données
      Object.keys(SCHEMAS).forEach(key => {
        if (body.data[key]) {
          jsonToSheet(getSheet(key), body.data[key], SCHEMAS[key]);
        }
      });
      result = { ok: true };

    } else if (action === 'saveSheet') {
      // Sauvegarde d'un seul onglet
      const key = body.sheet;
      if (SCHEMAS[key]) {
        jsonToSheet(getSheet(key), body.data, SCHEMAS[key]);
        result = { ok: true, sheet: key };
      } else {
        result = { error: 'Onglet inconnu: ' + key };
      }

    } else if (action === 'uploadPhoto') {
      // Upload photo vers Google Drive
      const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      const blob = Utilities.newBlob(
        Utilities.base64Decode(body.base64),
        body.mimeType || 'image/jpeg',
        body.fileName || 'photo_' + Date.now() + '.jpg'
      );
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const fileId = file.getId();
      result = {
        ok: true,
        fileId: fileId,
        url: 'https://lh3.googleusercontent.com/d/' + fileId,
        driveUrl: 'https://drive.google.com/file/d/' + fileId + '/view'
      };

    } else {
      result = { error: 'Action inconnue: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Backup automatique vers Google Drive ───

// ID du dossier Google Drive pour les backups (à configurer ci-dessous)
// Créez un dossier "GMAO Backups" dans Google Drive et collez son ID ici
const BACKUP_FOLDER_ID = 'VOTRE_BACKUP_FOLDER_ID';

// Nombre maximum de backups à conserver (les plus anciens sont supprimés)
const MAX_BACKUPS = 30;

/**
 * Sauvegarde toutes les données GMAO en fichier JSON dans Google Drive.
 * Peut être appelée manuellement ou par un trigger automatique.
 */
function backupToGoogleDrive() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = {};

  // Collecter toutes les données de chaque onglet
  Object.keys(SCHEMAS).forEach(key => {
    const sheet = ss.getSheetByName(key);
    if (sheet) {
      data[key] = sheetToJson(sheet);
    } else {
      data[key] = [];
    }
  });

  // Horodatage pour le nom de fichier
  const now = new Date();
  const ts = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm');
  const fileName = 'GMAO_backup_' + ts + '.json';

  // Sauvegarder dans le dossier Drive
  const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
  const jsonContent = JSON.stringify(data, null, 2);
  folder.createFile(fileName, jsonContent, 'application/json');

  // Rotation : supprimer les backups les plus anciens au-delà de MAX_BACKUPS
  cleanOldBackups_(folder);

  Logger.log('Backup GMAO créé : ' + fileName + ' (' + jsonContent.length + ' octets)');
  return fileName;
}

/**
 * Supprime les backups les plus anciens pour ne garder que MAX_BACKUPS fichiers.
 */
function cleanOldBackups_(folder) {
  const files = folder.getFilesByType('application/json');
  const backups = [];

  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().startsWith('GMAO_backup_')) {
      backups.push({ file: file, date: file.getDateCreated() });
    }
  }

  // Trier du plus récent au plus ancien
  backups.sort((a, b) => b.date - a.date);

  // Supprimer ceux au-delà de la limite
  for (let i = MAX_BACKUPS; i < backups.length; i++) {
    backups[i].file.setTrashed(true);
    Logger.log('Ancien backup supprimé : ' + backups[i].file.getName());
  }
}

/**
 * Restaure les données depuis un fichier backup JSON.
 * Utilisation : restoreFromBackup('GMAO_backup_2026-04-25_08-00.json')
 */
function restoreFromBackup(fileName) {
  const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
  const files = folder.getFilesByName(fileName);

  if (!files.hasNext()) {
    throw new Error('Fichier backup introuvable : ' + fileName);
  }

  const file = files.next();
  const data = JSON.parse(file.getBlob().getDataAsString());

  // Écrire chaque onglet
  Object.keys(SCHEMAS).forEach(key => {
    if (data[key]) {
      jsonToSheet(getSheet(key), data[key], SCHEMAS[key]);
    }
  });

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Données restaurées depuis ' + fileName, 'Restauration', 10
  );
  Logger.log('Restauration terminée depuis : ' + fileName);
}

/**
 * Liste tous les backups disponibles dans le dossier Drive.
 * Utile pour choisir quel backup restaurer.
 */
function listBackups() {
  const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
  const files = folder.getFilesByType('application/json');
  const list = [];

  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().startsWith('GMAO_backup_')) {
      list.push({
        name: file.getName(),
        date: file.getDateCreated(),
        size: file.getSize()
      });
    }
  }

  list.sort((a, b) => b.date - a.date);
  list.forEach((b, i) => {
    Logger.log((i + 1) + '. ' + b.name + ' (' + Math.round(b.size / 1024) + ' Ko)');
  });

  return list;
}

/**
 * Installe le trigger de backup journalier automatique.
 * Exécutez cette fonction UNE SEULE FOIS.
 */
function installBackupTrigger() {
  // Vérifier qu'un trigger n'existe pas déjà
  const existing = ScriptApp.getProjectTriggers().filter(
    t => t.getHandlerFunction() === 'backupToGoogleDrive'
  );
  if (existing.length > 0) {
    Logger.log('Trigger backup déjà installé.');
    return;
  }

  // Backup tous les jours entre 2h et 3h du matin
  ScriptApp.newTrigger('backupToGoogleDrive')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();

  Logger.log('Trigger backup journalier installé (entre 2h et 3h).');
}

/**
 * Supprime le trigger de backup automatique.
 */
function removeBackupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'backupToGoogleDrive')
    .forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Trigger backup supprimé.');
}

// ─── Initialisation ───
// Exécutez cette fonction une fois pour créer tous les onglets
function initSheets() {
  Object.keys(SCHEMAS).forEach(key => {
    const sheet = getSheet(key);
    const headers = SCHEMAS[key];
    // Always update headers row (add new columns if schema changed)
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  });
  SpreadsheetApp.getActiveSpreadsheet().toast('Onglets GMAO mis à jour !', 'Initialisation', 5);
}
