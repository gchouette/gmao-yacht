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
  equipage: ['id','nId','nom','role','tel','email','actif','numMarin','numPasseport','permanent','dateDebut','dateFin','photo'],
  composants: ['id','nId','famille','sg','nom','marque','modele','serie','install','manuel','photos'],
  maint: ['id','nId','compId','cat','titre','prio','statut','echeance','dateFin','freq','cout','coutReel','assigneA','desc','justif','workflow','photos','recurrence','parentId','checklist','factures','datePaiement','statutPaiement'],
  couts: ['id','nId','cat','desc','montant','date','fournisseur','justif','chartId','maintId','datePaiement','statutPaiement'],
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
