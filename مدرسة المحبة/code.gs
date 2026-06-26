/**
 * كود Google Apps Script المحدث لمدرسة المحبة
 * -------------------------------------------------
 * التغييرات الجديدة:
 *   1- إلغاء عمود التاريخ تماماً لتصبح السجلات تراكمية لكل طالب في صف واحد فقط.
 *   2- هيكلية الشيت تتكون من 14 عموداً (المادة وجوارها البونص الخاص بها).
 *   3- منع تكرار الأسماء تماماً عند التسجيل أو التعديل، ودمج السجلات المتكررة تلقائياً.
 *   4- نقل صف الطالب تلقائياً بين الشيتات عند تعديل فريقه.
 */

// --------------------------------------------
// إعداد وترتيب صفحات جوجل شيت
// --------------------------------------------
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. إنشاء أو التأكد من وجود صفحة "درجات المواد"
  var subjectsSheet = ss.getSheetByName("درجات المواد");
  if (!subjectsSheet) {
    subjectsSheet = ss.insertSheet("درجات المواد");
    var headers = ["الاسم", "الفريق", "الدور", "السلوكيات", "الألحان", "العقيدة", "تاريخ الكنيسة", "الكتاب المقدس", "أبطال إيمان", "مجموع درجات المواد"];
    subjectsSheet.appendRow(headers);
    subjectsSheet.getRange(1, 1, 1, headers.length)
                 .setFontWeight("bold")
                 .setBackground("#2b3e50")
                 .setFontColor("#ffffff")
                 .setHorizontalAlignment("center");
    subjectsSheet.setFrozenRows(1);
  } else {
    var maxColsSub = subjectsSheet.getMaxColumns();
    if (maxColsSub < 10) {
      subjectsSheet.insertColumnsAfter(maxColsSub, 10 - maxColsSub);
    }
    var headers = subjectsSheet.getRange(1, 1, 1, 10).getValues()[0];
    var expectedHeaders = ["الاسم", "الفريق", "الدور", "السلوكيات", "الألحان", "العقيدة", "تاريخ الكنيسة", "الكتاب المقدس", "أبطال إيمان", "مجموع درجات المواد"];
    var needsUpdate = false;
    for (var i = 0; i < expectedHeaders.length; i++) {
      if (headers[i] !== expectedHeaders[i]) {
        needsUpdate = true;
        break;
      }
    }
    if (needsUpdate || headers.length < 10) {
      subjectsSheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      subjectsSheet.getRange(1, 1, 1, expectedHeaders.length)
                   .setFontWeight("bold")
                   .setBackground("#2b3e50")
                   .setFontColor("#ffffff")
                   .setHorizontalAlignment("center");
    }
  }

  // 2. إنشاء وتأمين شيتات الغياب لكل فريق
  var sheet1 = setupTeamSheet(ss, "غياب الفريق الأول");
  var sheet2 = setupTeamSheet(ss, "غياب الفريق الثاني");
  var sheetUnspecified = setupTeamSheet(ss, "غياب غير محدد");

  // 2.5 إنشاء وتأمين شيت "سجل الحضور" للحفاظ على التاريخ وتفادي التكرار التراكمي
  var logSheet = ss.getSheetByName("سجل الحضور");
  if (!logSheet) {
    logSheet = ss.insertSheet("سجل الحضور");
    var logHeaders = ["التاريخ", "المادة", "الفريق", "الاسم", "الحالة", "البونص"];
    logSheet.appendRow(logHeaders);
    logSheet.getRange(1, 1, 1, logHeaders.length)
             .setFontWeight("bold")
             .setBackground("#2c3e50")
             .setFontColor("#ffffff")
             .setHorizontalAlignment("center");
    logSheet.setFrozenRows(1);
  }

  // 3. الترحيل التلقائي من الشيت القديم "غياب الفرق" إن وجد
  var oldGlobalSheet = ss.getSheetByName("غياب الفرق");
  if (oldGlobalSheet) {
    var lastRowVal = oldGlobalSheet.getLastRow();
    if (lastRowVal > 1) {
      var oldHeaders = oldGlobalSheet.getRange(1, 1, 1, Math.min(oldGlobalSheet.getLastColumn(), 11)).getValues()[0];
      var oldData = oldGlobalSheet.getRange(2, 1, lastRowVal - 1, oldHeaders.length).getValues();
      
      var rows1 = [];
      var rows2 = [];
      var rowsUnspecified = [];
      
      oldData.forEach(function(row) {
        var name = row[1] ? row[1].toString().trim() : "";
        var team = row[2] ? row[2].toString().trim() : "";
        
        // تجاوز صفوف المجاميع القديمة أو الصفوف الفارغة
        if (!name || name === "الاسم" || name === "" || name.indexOf("المجموع") !== -1) {
          return;
        }
        
        var bookScore = 0, historyScore = 0, hymnsScore = 0, heroesScore = 0, behaviorScore = 0, creedScore = 0, bonusScore = 0;
        
        function getValByHeader(headerNames, defaultValue) {
          for (var i = 0; i < headerNames.length; i++) {
            var idx = oldHeaders.indexOf(headerNames[i]);
            if (idx !== -1) {
              var val = row[idx];
              if (val === "" || val === null || val === undefined) return defaultValue;
              if (typeof val === "string" && (val.indexOf("المجموع") !== -1 || val.indexOf("الكل") !== -1)) {
                return defaultValue;
              }
              return val;
            }
          }
          return defaultValue;
        }
        
        var bookVal = getValByHeader(["كتاب مقدس", "الكتاب المقدس"], null);
        var generalVal = getValByHeader(["حضور عام"], null);
        bookScore = Number(bookVal !== null ? bookVal : generalVal) || 0;
        
        historyScore = Number(getValByHeader(["تاريخ كنيسة", "تاريخ الكنيسة"], 0)) || 0;
        hymnsScore = Number(getValByHeader(["ألحان", "الألحان"], 0)) || 0;
        heroesScore = Number(getValByHeader(["أبطال إيمان"], 0)) || 0;
        behaviorScore = Number(getValByHeader(["سلوكيات", "السلوكيات"], 0)) || 0;
        creedScore = Number(getValByHeader(["عقيدة", "العقيدة"], 0)) || 0;
        bonusScore = Number(getValByHeader(["البونص"], 0)) || 0;
        
        var record = [
          name, team,
          bookScore, bonusScore,
          historyScore, 0,
          hymnsScore, 0,
          heroesScore, 0,
          behaviorScore, 0,
          creedScore, 0
        ];
        
        if (team === "الفريق الأول") {
          rows1.push(record);
        } else if (team === "الفريق الثاني") {
          rows2.push(record);
        } else {
          rowsUnspecified.push(record);
        }
      });
      
      if (rows1.length > 0) sheet1.getRange(sheet1.getLastRow() + 1, 1, rows1.length, 14).setValues(rows1);
      if (rows2.length > 0) sheet2.getRange(sheet2.getLastRow() + 1, 1, rows2.length, 14).setValues(rows2);
      if (rowsUnspecified.length > 0) sheetUnspecified.getRange(sheetUnspecified.getLastRow() + 1, 1, rowsUnspecified.length, 14).setValues(rowsUnspecified);
    }
    
    // حذف الشيت القديم بعد الترحيل الناجح
    ss.deleteSheet(oldGlobalSheet);
  }

  // 4. تنظيف الفراغات وحساب المجاميع لجميع الشيتات
  cleanSheetGaps(sheet1);
  cleanSheetGaps(sheet2);
  cleanSheetGaps(sheetUnspecified);
}

// --------------------------------------------
// تهيئة شيت الفريق الفردي
// --------------------------------------------
function setupTeamSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  var isNew = false;
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    isNew = true;
  }
  
  var maxCols = sheet.getMaxColumns();
  if (maxCols < 16) {
    sheet.insertColumnsAfter(maxCols, 16 - maxCols);
  }
  
  var expectedHeaders = ["الاسم", "الفريق", "كتاب مقدس", "بونص كتاب مقدس", "تاريخ كنيسة", "بونص تاريخ كنيسة", "ألحان", "بونص ألحان", "أبطال إيمان", "بونص أبطال إيمان", "سلوكيات", "بونص سلوكيات", "عقيدة", "بونص عقيدة", "إجمالي الحضور", "إجمالي البونص"];
  var headers = [];
  var lastRow = sheet.getLastRow();
  if (!isNew && lastRow > 0) {
    var actualCols = Math.min(sheet.getLastColumn(), 17);
    if (actualCols > 0) {
      headers = sheet.getRange(1, 1, 1, actualCols).getValues()[0];
    }
  }
  
  // التحقق من الحاجة للتحديث
  var needsInit = isNew || headers.length !== expectedHeaders.length;
  if (!needsInit) {
    for (var i = 0; i < expectedHeaders.length; i++) {
      if (headers[i] !== expectedHeaders[i]) {
        needsInit = true;
        break;
      }
    }
  }
  
  if (needsInit) {
    if (!isNew && lastRow > 0) {
      // فقط نكتب الهيدر في الصف الأول للحفاظ على البيانات الموجودة
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    } else {
      sheet.clear();
      var currentMaxCols = sheet.getMaxColumns();
      if (currentMaxCols > 16) {
        sheet.deleteColumns(17, currentMaxCols - 16);
      }
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    }
    sheet.getRange(1, 1, 1, expectedHeaders.length)
         .setFontWeight("bold")
         .setBackground("#2b3e50")
         .setFontColor("#ffffff")
         .setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  }
  
  return sheet;
}

// --------------------------------------------
// ترحيل البيانات وتجميع السجلات القديمة تراكمياً في 14 عموداً
// --------------------------------------------
function migrateTo14Columns(sheet) {
  var lastRowVal = sheet.getLastRow();
  if (lastRowVal < 2) return;
  
  var lastRowA = getLastRowB(sheet);
  if (lastRowA < 2) return;
  
  var actualCols = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, actualCols).getValues()[0];
  
  var nameIdx = headers.indexOf("الاسم");
  var teamIdx = headers.indexOf("الفريق");
  var bookIdx = headers.indexOf("كتاب مقدس");
  var bookBonusIdx = headers.indexOf("بونص كتاب مقدس");
  var historyIdx = headers.indexOf("تاريخ كنيسة");
  var historyBonusIdx = headers.indexOf("بونص تاريخ كنيسة");
  var hymnsIdx = headers.indexOf("ألحان");
  var hymnsBonusIdx = headers.indexOf("بونص ألحان");
  var heroesIdx = headers.indexOf("أبطال إيمان");
  var heroesBonusIdx = headers.indexOf("بونص أبطال إيمان");
  var behaviorIdx = headers.indexOf("سلوكيات");
  var behaviorBonusIdx = headers.indexOf("بونص سلوكيات");
  var creedIdx = headers.indexOf("عقيدة");
  var creedBonusIdx = headers.indexOf("بونص عقيدة");
  
  var oldBonusIdx = headers.indexOf("البونص");
  
  var dataRange = sheet.getRange(2, 1, lastRowA - 1, actualCols).getValues();
  var studentData = {};
  
  dataRange.forEach(function(row) {
    var name = nameIdx !== -1 ? row[nameIdx] : "";
    if (!name) return;
    var nameStr = name.toString().trim();
    if (nameStr === "المجموع الكلي للفريق" || nameStr === "المجموع" || nameStr === "") {
      return;
    }
    
    var team = teamIdx !== -1 ? row[teamIdx] : "";
    var book = bookIdx !== -1 ? Number(row[bookIdx]) || 0 : 0;
    var bookBonus = bookBonusIdx !== -1 ? Number(row[bookBonusIdx]) || 0 : 0;
    var history = historyIdx !== -1 ? Number(row[historyIdx]) || 0 : 0;
    var historyBonus = historyBonusIdx !== -1 ? Number(row[historyBonusIdx]) || 0 : 0;
    var hymns = hymnsIdx !== -1 ? Number(row[hymnsIdx]) || 0 : 0;
    var hymnsBonus = hymnsBonusIdx !== -1 ? Number(row[hymnsBonusIdx]) || 0 : 0;
    var heroes = heroesIdx !== -1 ? Number(row[heroesIdx]) || 0 : 0;
    var heroesBonus = heroesBonusIdx !== -1 ? Number(row[heroesBonusIdx]) || 0 : 0;
    var behavior = behaviorIdx !== -1 ? Number(row[behaviorIdx]) || 0 : 0;
    var behaviorBonus = behaviorBonusIdx !== -1 ? Number(row[behaviorBonusIdx]) || 0 : 0;
    var creed = creedIdx !== -1 ? Number(row[creedIdx]) || 0 : 0;
    var creedBonus = creedBonusIdx !== -1 ? Number(row[creedBonusIdx]) || 0 : 0;
    
    if (oldBonusIdx !== -1 && bookBonusIdx === -1) {
      bookBonus += Number(row[oldBonusIdx]) || 0;
    }
    
    var norm = normName(nameStr);
    if (!studentData[norm]) {
      studentData[norm] = {
        name: nameStr,
        team: team,
        book: 0, bookBonus: 0,
        history: 0, historyBonus: 0,
        hymns: 0, hymnsBonus: 0,
        heroes: 0, heroesBonus: 0,
        behavior: 0, behaviorBonus: 0,
        creed: 0, creedBonus: 0
      };
    }
    
    studentData[norm].book += book;
    studentData[norm].bookBonus += bookBonus;
    studentData[norm].history += history;
    studentData[norm].historyBonus += historyBonus;
    studentData[norm].hymns += hymns;
    studentData[norm].hymnsBonus += hymnsBonus;
    studentData[norm].heroes += heroes;
    studentData[norm].heroesBonus += heroesBonus;
    studentData[norm].behavior += behavior;
    studentData[norm].behaviorBonus += behaviorBonus;
    studentData[norm].creed += creed;
    studentData[norm].creedBonus += creedBonus;
  });
  
  sheet.clear();
  
  var maxCols = sheet.getMaxColumns();
  if (maxCols < 14) {
    sheet.insertColumnsAfter(maxCols, 14 - maxCols);
  } else if (maxCols > 14) {
    sheet.deleteColumns(15, maxCols - 14);
  }
  
  var expectedHeaders = ["الاسم", "الفريق", "كتاب مقدس", "بونص كتاب مقدس", "تاريخ كنيسة", "بونص تاريخ كنيسة", "ألحان", "بونص ألحان", "أبطال إيمان", "بونص أبطال إيمان", "سلوكيات", "بونص سلوكيات", "عقيدة", "بونص عقيدة"];
  sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
  sheet.getRange(1, 1, 1, expectedHeaders.length)
       .setFontWeight("bold")
       .setBackground("#2b3e50")
       .setFontColor("#ffffff")
       .setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  
  var newRows = [];
  for (var normKey in studentData) {
    var d = studentData[normKey];
    newRows.push([
      d.name, d.team,
      d.book, d.bookBonus,
      d.history, d.historyBonus,
      d.hymns, d.hymnsBonus,
      d.heroes, d.heroesBonus,
      d.behavior, d.behaviorBonus,
      d.creed, d.creedBonus
    ]);
  }
  
  if (newRows.length > 0) {
    sheet.getRange(2, 1, newRows.length, 14).setValues(newRows);
  }
}

// --------------------------------------------
// تنظيف وترتيب وإلغاء أي فواصل فارغة في الصفوف ودمج المتكرر
// --------------------------------------------
function cleanSheetGaps(sheet) {
  var lastRowVal = sheet.getLastRow();
  if (lastRowVal < 2) return;
  
  var lastRowA = getLastRowB(sheet);
  if (lastRowA < 2) return;
  
  var dataRange = sheet.getRange(2, 1, lastRowA - 1, 16).getValues();
  var studentMap = {};
  var cleanRows = [];
  
  dataRange.forEach(function(row) {
    var name = row[0] ? row[0].toString().trim() : "";
    var team = row[1] ? row[1].toString().trim() : "";
    
    if (name === "المجموع الكلي للفريق" || name === "المجموع" || !name) {
      return;
    }
    
    if (name && name !== "" && name !== "الاسم") {
      var norm = normName(name);
      
      var bookScore = Number(row[2]) || 0;
      var bonusBook = Number(row[3]) || 0;
      var historyScore = Number(row[4]) || 0;
      var bonusHistory = Number(row[5]) || 0;
      var hymnsScore = Number(row[6]) || 0;
      var bonusHymns = Number(row[7]) || 0;
      var heroesScore = Number(row[8]) || 0;
      var bonusHeroes = Number(row[9]) || 0;
      var behaviorScore = Number(row[10]) || 0;
      var bonusBehavior = Number(row[11]) || 0;
      var creedScore = Number(row[12]) || 0;
      var bonusCreed = Number(row[13]) || 0;
      
      if (studentMap[norm] === undefined) {
        var newRow = [
          name, team,
          bookScore, bonusBook,
          historyScore, bonusHistory,
          hymnsScore, bonusHymns,
          heroesScore, bonusHeroes,
          behaviorScore, bonusBehavior,
          creedScore, bonusCreed,
          "", "" // سنملأ الصيغ أدناه
        ];
        cleanRows.push(newRow);
        studentMap[norm] = cleanRows.length - 1;
      } else {
        var idx = studentMap[norm];
        cleanRows[idx][2] += bookScore;
        cleanRows[idx][3] += bonusBook;
        cleanRows[idx][4] += historyScore;
        cleanRows[idx][5] += bonusHistory;
        cleanRows[idx][6] += hymnsScore;
        cleanRows[idx][7] += bonusHymns;
        cleanRows[idx][8] += heroesScore;
        cleanRows[idx][9] += bonusHeroes;
        cleanRows[idx][10] += behaviorScore;
        cleanRows[idx][11] += bonusBehavior;
        cleanRows[idx][12] += creedScore;
        cleanRows[idx][13] += bonusCreed;
      }
    }
  });
  
  var maxRow = sheet.getLastRow();
  if (maxRow >= 2) {
    sheet.getRange(2, 1, maxRow - 1, 16).clearContent();
    sheet.getRange(2, 1, maxRow - 1, 16).clearFormat();
  }
  
  if (cleanRows.length > 0) {
    // تعبئة معادلات المجاميع لكل صف للأعمدة 15 و 16
    for (var r = 0; r < cleanRows.length; r++) {
      var rowNum = r + 2;
      cleanRows[r][14] = "=SUM(C" + rowNum + ",E" + rowNum + ",G" + rowNum + ",I" + rowNum + ",K" + rowNum + ",M" + rowNum + ")";
      cleanRows[r][15] = "=SUM(D" + rowNum + ",F" + rowNum + ",H" + rowNum + ",J" + rowNum + ",L" + rowNum + ",N" + rowNum + ")";
    }
    sheet.getRange(2, 1, cleanRows.length, 16).setValues(cleanRows);
  }
  
  updateTeamSheetTotals(sheet);
}

// --------------------------------------------
// تحديث صف المجموع التلقائي أسفل الشيت
// --------------------------------------------
function updateTeamSheetTotals(sheet) {
  var lastRowA = getLastRowB(sheet);
  
  // حذف أي صف مجاميع قديم
  var totalRowIndex = -1;
  if (lastRowA > 1) {
    var names = sheet.getRange(2, 1, lastRowA - 1, 1).getValues();
    for (var i = 0; i < names.length; i++) {
      if (names[i][0] === "المجموع الكلي للفريق") {
        totalRowIndex = i + 2;
        break;
      }
    }
  }
  
  if (totalRowIndex !== -1) {
    sheet.deleteRow(totalRowIndex);
    lastRowA = getLastRowB(sheet);
  }
  
  if (lastRowA < 2) return;
  
  // إنشاء صف إجمالي جديد
  var newTotalRowIdx = lastRowA + 1;
  var totalLabelRange = sheet.getRange(newTotalRowIdx, 1, 1, 2);
  totalLabelRange.merge();
  totalLabelRange.setValue("المجموع الكلي للفريق")
                 .setFontWeight("bold")
                 .setBackground("#f1c40f")
                 .setFontColor("#2c3e50")
                 .setHorizontalAlignment("center");
                 
  // معادلات التجميع للأعمدة C إلى P (Columns 3 to 16)
  var colLetters = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"];
  var formulas = [];
  for (var c = 0; c < colLetters.length; c++) {
    var letter = colLetters[c];
    formulas.push('=SUM(' + letter + '2:' + letter + lastRowA + ')');
  }
  
  sheet.getRange(newTotalRowIdx, 3, 1, 14).setFormulas([formulas])
       .setFontWeight("bold")
       .setBackground("#f1c40f")
       .setFontColor("#2c3e50")
       .setHorizontalAlignment("center");
}

// --------------------------------------------
// الحصول على عمود الاسم ديناميكياً
// --------------------------------------------
function getNameColumnIndex(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return 1;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = headers.indexOf("الاسم");
  return idx !== -1 ? idx + 1 : 1;
}

// --------------------------------------------
// الحصول على الصف الأخير الفعلي بناءً على عمود الاسم لتجنب صف المجاميع
// --------------------------------------------
function getLastRowB(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) return 0;
  var colIdx = getNameColumnIndex(sheet);
  var colValues = sheet.getRange(1, colIdx, lastRow, 1).getValues();
  for (var i = colValues.length - 1; i >= 0; i--) {
    var val = colValues[i][0];
    if (val !== "" && val !== null && val !== undefined) {
      return i + 1;
    }
  }
  return 1;
}

function parseDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) {
    return dateVal;
  }
  var str = dateVal.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    var parts = str.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  var timestamp = Date.parse(str);
  if (!isNaN(timestamp)) {
    return new Date(timestamp);
  }
  return null;
}

function formatDate(dateVal) {
  var d = parseDate(dateVal);
  if (!d) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// --------------------------------------------
// GET – جلب قائمة الطلاب وتفاصيل درجاتهم للموقع
// --------------------------------------------
// --------------------------------------------
// دالة إعادة حساب وتجميع درجات الحضور والغياب من سجل الحضور إلى شيتات غياب الفرق
// --------------------------------------------
function recalculateTeamSheetsFromLog(ss) {
  var logSheet = ss.getSheetByName("سجل الحضور");
  if (!logSheet) return;
  
  var logData = logSheet.getDataRange().getValues();
  var studentScores = {}; // normName -> subject -> { attendance, bonus }
  
  for (var i = 1; i < logData.length; i++) {
    var name = logData[i][3];
    if (!name) continue;
    var norm = normName(name);
    var subject = logData[i][1];
    var status = logData[i][4];
    var bonus = Number(logData[i][5]) || 0;
    
    if (!studentScores[norm]) {
      studentScores[norm] = {};
    }
    if (!studentScores[norm][subject]) {
      studentScores[norm][subject] = { attendance: 0, bonus: 0 };
    }
    
    var score = 0;
    if (status === "حاضر") score = 1;
    else if (status === "متأخر") score = 0.5;
    
    studentScores[norm][subject].attendance += score;
    studentScores[norm][subject].bonus += bonus;
  }
  
  // 2. قراءة جميع الطلاب من شيت "درجات المواد" للحفاظ على الهيكل العام والفرق الحالية
  var sSheet = ss.getSheetByName("درجات المواد");
  if (!sSheet) return;
  var sData = sSheet.getDataRange().getValues();
  
  var teamRows = {
    "الفريق الأول": [],
    "الفريق الثاني": [],
    "غير محدد": []
  };
  
  var colMap = {
    "كتاب مقدس": { att: 2, bon: 3 },      // C, D
    "تاريخ الكنيسة": { att: 4, bon: 5 },   // E, F
    "تاريخ كنيسة": { att: 4, bon: 5 },
    "ألحان": { att: 6, bon: 7 },          // G, H
    "أبطال إيمان": { att: 8, bon: 9 },      // I, J
    "سلوكيات": { att: 10, bon: 11 },      // K, L
    "عقيدة": { att: 12, bon: 13 }         // M, N
  };
  
  for (var i = 1; i < sData.length; i++) {
    var name = sData[i][0];
    if (!name) continue;
    var team = sData[i][1] || "غير محدد";
    var norm = normName(name);
    
    // إنشاء صف جديد يحتوي على 16 عموداً
    var row = [
      name,
      team,
      0, 0, // C, D
      0, 0, // E, F
      0, 0, // G, H
      0, 0, // I, J
      0, 0, // K, L
      0, 0, // M, N
      "", "" // O, P (المعادلات)
    ];
    
    // إذا كان للطالب درجات في سجل الحضور، نقوم بتعبئتها
    if (studentScores[norm]) {
      for (var sub in studentScores[norm]) {
        var cols = colMap[sub];
        if (cols) {
          row[cols.att] = studentScores[norm][sub].attendance;
          row[cols.bon] = studentScores[norm][sub].bonus;
        }
      }
    }
    
    var targetTeam = team;
    if (targetTeam !== "الفريق الأول" && targetTeam !== "الفريق الثاني") {
      targetTeam = "غير محدد";
    }
    teamRows[targetTeam].push(row);
  }
  
  var teamSheetNames = {
    "الفريق الأول": "غياب الفريق الأول",
    "الفريق الثاني": "غياب الفريق الثاني",
    "غير محدد": "غياب غير محدد"
  };
  
  // 3. كتابة البيانات المحدثة لكل شيت دفعة واحدة
  for (var teamKey in teamSheetNames) {
    var tSheet = ss.getSheetByName(teamSheetNames[teamKey]);
    if (!tSheet) continue;
    
    // مسح كافة البيانات الموجودة تحت الهيدر لضمان النظافة
    var maxRow = tSheet.getMaxRows();
    if (maxRow > 1) {
      tSheet.deleteRows(2, maxRow - 1);
    }
    
    var rowsToWrite = teamRows[teamKey];
    if (rowsToWrite && rowsToWrite.length > 0) {
      tSheet.insertRowsAfter(1, rowsToWrite.length);
      
      // كتابة صيغ المجاميع
      for (var r = 0; r < rowsToWrite.length; r++) {
        var rowNum = r + 2;
        rowsToWrite[r][14] = "=SUM(C" + rowNum + ",E" + rowNum + ",G" + rowNum + ",I" + rowNum + ",K" + rowNum + ",M" + rowNum + ")";
        rowsToWrite[r][15] = "=SUM(D" + rowNum + ",F" + rowNum + ",H" + rowNum + ",J" + rowNum + ",L" + rowNum + ",N" + rowNum + ")";
      }
      
      // كتابة الصفوف بالكامل في خطوة واحدة
      tSheet.getRange(2, 1, rowsToWrite.length, 16).setValues(rowsToWrite);
    }
    
    // تحديث صف المجموع التلقائي في أسفل الشيت
    updateTeamSheetTotals(tSheet);
  }
}

// --------------------------------------------
// تهيئة الشيتات فقط عند الحاجة لتسريع الاستجابة
// --------------------------------------------
function setupSheetsIfNeeded() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName("درجات المواد") || 
      !ss.getSheetByName("غياب الفريق الأول") || 
      !ss.getSheetByName("غياب الفريق الثاني") || 
      !ss.getSheetByName("سجل الحضور")) {
    setupSheets();
  }
}

// --------------------------------------------
// GET – جلب قائمة الطلاب وتفاصيل درجاتهم للموقع
// --------------------------------------------
function doGet(e) {
  setupSheetsIfNeeded();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // التحقق من الاستعلام عن وجود تسجيل حضور مسبق
  if (e && e.parameter && e.parameter.action === "checkAttendanceExists") {
    var logSheet = ss.getSheetByName("سجل الحضور");
    var subject = e.parameter.subject;
    var dateStr = formatDate(e.parameter.date);
    var team = e.parameter.team;
    
    var logRows = logSheet ? logSheet.getDataRange().getValues() : [];
    var exists = false;
    
    for (var l = 1; l < logRows.length; l++) {
      if (formatDate(logRows[l][0]) === dateStr && 
          logRows[l][1] === subject && 
          logRows[l][2] === team &&
          logRows[l][4] !== "") {
        exists = true;
        break;
      }
    }
    
    var res = { status: "success", exists: exists };
    return ContentService.createTextOutput(JSON.stringify(res))
                          .setMimeType(ContentService.MimeType.JSON);
  }

  // قراءة مجاميع الغياب والبونص من شيتات الفرق لكل طالب
  var studentTotals = {};
  var teamSheets = ["غياب الفريق الأول", "غياب الفريق الثاني", "غياب غير محدد"];
  teamSheets.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      var lastRow = getLastRowB(sheet);
      if (lastRow > 1) {
        var data = sheet.getRange(2, 1, lastRow - 1, 16).getValues();
        data.forEach(function(row) {
          var name = row[0];
          if (name && name !== "المجموع الكلي للفريق" && name !== "الاسم") {
            var norm = normName(name);
            studentTotals[norm] = {
              attendance: Number(row[14]) || 0,
              bonus: Number(row[15]) || 0
            };
          }
        });
      }
    }
  });

  var sheet = ss.getSheetByName("درجات المواد");
  var data = sheet.getDataRange().getValues();
  var students = [];

  for (var i = 1; i < data.length; i++) {
    var name = data[i][0];
    if (!name) continue;
    var norm = normName(name);
    var totals = studentTotals[norm] || { attendance: 0, bonus: 0 };
    
    students.push({
      name: name,
      team: data[i][1] || "غير محدد",
      role: data[i][2] || "عضو",
      behavior: Number(data[i][3]) || 0,
      hymns: Number(data[i][4]) || 0,
      creed: Number(data[i][5]) || 0,
      history: Number(data[i][6]) || 0,
      bible: Number(data[i][7]) || 0,
      heroes: Number(data[i][8]) || 0,
      total: Number(data[i][9]) || 0,
      attendanceTotal: totals.attendance,
      bonusTotal: totals.bonus
    });
  }

  var result = { status: "success", students: students };
  return ContentService.createTextOutput(JSON.stringify(result))
                        .setMimeType(ContentService.MimeType.JSON);
}

// --------------------------------------------
// تحديث لوحة الصدارة لدرجات المواد وتحديد الطالب صاحب أعلى مجموع
// --------------------------------------------
function updateLeaderboard(ss) {
  var sSheet = ss.getSheetByName("درجات المواد");
  if (!sSheet) return;
  var lastRow = sSheet.getLastRow();
  if (lastRow < 2) return;
  
  // ترتيب الجدول تنازلياً حسب مجموع درجات المواد (العمود 10)
  sSheet.getRange(2, 1, lastRow - 1, 10).sort({column: 10, ascending: false});
  
  var range = sSheet.getRange(2, 1, lastRow - 1, 10);
  var values = range.getValues();
  var maxScore = 0;
  for (var i = 0; i < values.length; i++) {
    var score = Number(values[i][9]) || 0;
    if (score > maxScore) {
      maxScore = score;
    }
  }
  
  // تحديد الخلفية الذهبية الفاتحة للطالب/الطلاب الحاصلين على أعلى درجة
  var backgrounds = [];
  for (var i = 0; i < values.length; i++) {
    var rowBg = [];
    var score = Number(values[i][9]) || 0;
    var isTop = (score === maxScore && maxScore > 0);
    for (var col = 0; col < 10; col++) {
      rowBg.push(isTop ? "#fef9e7" : "#ffffff");
    }
    backgrounds.push(rowBg);
  }
  range.setBackgrounds(backgrounds);
  
  // جعل اسم الطالب الحاصل على أعلى درجة بخط عريض ولون ذهبي داكن
  for (var i = 0; i < values.length; i++) {
    var score = Number(values[i][9]) || 0;
    var isTop = (score === maxScore && maxScore > 0);
    var nameCell = sSheet.getRange(i + 2, 1);
    if (isTop) {
      nameCell.setFontWeight("bold").setFontColor("#b7950b");
    } else {
      nameCell.setFontWeight("normal").setFontColor("#000000");
    }
  }
}

// --------------------------------------------
// دالة مساعدة لرصد درجات المواد وتعديل المجموع
// --------------------------------------------
function recordSubjectScore(ss, studentName, subjectName, score) {
  var sSheet = ss.getSheetByName("درجات المواد");
  var rows = sSheet.getDataRange().getValues();
  
  var colIndex = -1;
  if (subjectName === "السلوكيات") colIndex = 4;
  else if (subjectName === "الألحان") colIndex = 5;
  else if (subjectName === "العقيدة") colIndex = 6;
  else if (subjectName === "تاريخ الكنيسة") colIndex = 7;
  else if (subjectName === "الكتاب المقدس") colIndex = 8;
  else if (subjectName === "أبطال إيمان") colIndex = 9;
  
  if (colIndex === -1) return false;
  
  for (var i = 1; i < rows.length; i++) {
    if (normName(rows[i][0]) === normName(studentName)) {
      var currentVal = Number(rows[i][colIndex - 1]) || 0;
      var newVal = currentVal + score;
      sSheet.getRange(i + 1, colIndex).setValue(newVal);
      
      var sum = 0;
      for (var c = 4; c <= 9; c++) {
        if (c === colIndex) sum += newVal;
        else sum += (Number(rows[i][c - 1]) || 0);
      }
      sSheet.getRange(i + 1, 10).setValue(sum);
      updateLeaderboard(ss);
      return true;
    }
  }
  return false;
}

// --------------------------------------------
// نقل صف الطالب بين شيتات الفرق عند تعديل الفريق لمنع التكرار
// --------------------------------------------
function syncStudentRowTeam(oldName, newName, newTeam) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var teamSheets = {
    "الفريق الأول": "غياب الفريق الأول",
    "الفريق الثاني": "غياب الفريق الثاني",
    "غير محدد": "غياب غير محدد"
  };
  
  var targetSheetName = teamSheets[newTeam] || "غياب غير محدد";
  
  var foundRowData = null;
  var sourceSheet = null;
  var sourceRowIndex = -1;
  
  for (var teamKey in teamSheets) {
    var sheetName = teamSheets[teamKey];
    var sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      var lastRowA = getLastRowB(sheet);
      if (lastRowA > 1) {
        var gRows = sheet.getRange(1, 1, lastRowA, 14).getValues();
        for (var j = 1; j < gRows.length; j++) {
          if (gRows[j][0] === "المجموع الكلي للفريق") continue;
          if (normName(gRows[j][0]) === normName(oldName)) {
            foundRowData = gRows[j];
            sourceSheet = sheet;
            sourceRowIndex = j + 1;
            break;
          }
        }
      }
    }
    if (foundRowData) break;
  }
  
  if (foundRowData) {
    foundRowData[0] = newName;
    foundRowData[1] = newTeam;
    
    if (sourceSheet.getName() === targetSheetName) {
      sourceSheet.getRange(sourceRowIndex, 1, 1, 14).setValues([foundRowData]);
    } else {
      sourceSheet.deleteRow(sourceRowIndex);
      cleanSheetGaps(sourceSheet);
      
      var targetSheet = ss.getSheetByName(targetSheetName);
      if (targetSheet) {
        var targetLastRow = getLastRowB(targetSheet);
        var existsRowIndex = -1;
        if (targetLastRow > 1) {
          var targetRows = targetSheet.getRange(1, 1, targetLastRow, 1).getValues();
          for (var k = 1; k < targetRows.length; k++) {
            if (normName(targetRows[k][0]) === normName(newName)) {
              existsRowIndex = k + 1;
              break;
            }
          }
        }
        
        if (existsRowIndex !== -1) {
          var existingRowData = targetSheet.getRange(existsRowIndex, 1, 1, 14).getValues()[0];
          for (var col = 2; col < 14; col++) {
            existingRowData[col] = (Number(existingRowData[col]) || 0) + (Number(foundRowData[col]) || 0);
          }
          existingRowData[0] = newName;
          existingRowData[1] = newTeam;
          targetSheet.getRange(existsRowIndex, 1, 1, 14).setValues([existingRowData]);
        } else {
          var nextRow = targetLastRow + 1;
          targetSheet.getRange(nextRow, 1, 1, 14).setValues([foundRowData]);
        }
        cleanSheetGaps(targetSheet);
      }
    }
  }
}

// --------------------------------------------
// POST – استقبال وتسجيل وحفظ البيانات
// --------------------------------------------
function doPost(e) {
  setupSheetsIfNeeded();
  var result = { status: "error", message: "Invalid Request" };

  try {
    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action;
    var data = requestData.data;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ---------- إضافة طالب جديد ----------
    if (action === "addStudent") {
      var sSheet = ss.getSheetByName("درجات المواد");
      var exists = sSheet.getDataRange().getValues().some(function(row) { return normName(row[0]) === normName(data.name); });
      if (exists) {
        result = { status: "error", message: "الاسم موجود مسبقًا" };
      } else {
        sSheet.appendRow([data.name, data.team, data.role || "عضو", 0, 0, 0, 0, 0, 0, 0]);
        updateLeaderboard(ss);
        result = { status: "success", message: "تم إضافة الطالب بنجاح" };
      }
    }
    // ---------- تعديل بيانات طالب ----------
    else if (action === "editStudent") {
      var sSheet = ss.getSheetByName("درجات المواد");
      var rows = sSheet.getDataRange().getValues();
      var found = false;
      for (var i = 1; i < rows.length; i++) {
        if (normName(rows[i][0]) === normName(data.oldName)) {
          sSheet.getRange(i + 1, 1).setValue(data.name);
          sSheet.getRange(i + 1, 2).setValue(data.team);
          sSheet.getRange(i + 1, 3).setValue(data.role);
          found = true;
          break;
        }
      }
      if (found) {
        syncStudentRowTeam(data.oldName, data.name, data.team);
        updateLeaderboard(ss);
      }
      result = found ? { status: "success", message: "تم تعديل الطالب بنجاح" }
                     : { status: "error",   message: "الطالب غير موجود" };
    }
    // ---------- حذف طالب ----------
    else if (action === "deleteStudent") {
      var sSheet = ss.getSheetByName("درجات المواد");
      var rows = sSheet.getDataRange().getValues();
      var found = false;
      for (var i = 1; i < rows.length; i++) {
        if (normName(rows[i][0]) === normName(data.name)) {
          sSheet.deleteRow(i + 1);
          found = true;
          break;
        }
      }
      if (found) {
        var teamSheets = ["غياب الفريق الأول", "غياب الفريق الثاني", "غياب غير محدد"];
        teamSheets.forEach(function(sheetName) {
          var tSheet = ss.getSheetByName(sheetName);
          if (tSheet) {
            var lastRowA = getLastRowB(tSheet);
            if (lastRowA > 1) {
              for (var j = lastRowA - 1; j >= 1; j--) {
                var nameInSheet = tSheet.getRange(j + 1, 1).getValue();
                if (nameInSheet === "المجموع الكلي للفريق") continue;
                if (normName(nameInSheet) === normName(data.name)) {
                  tSheet.deleteRow(j + 1);
                }
              }
            }
            cleanSheetGaps(tSheet);
          }
        });
        updateLeaderboard(ss);
      }
      result = found ? { status: "success", message: "تم حذف الطالب بنجاح" }
                     : { status: "error",   message: "الطالب غير موجود" };
    }
    // ---------- تسجيل حضور وغياب ----------
    else if (action === "recordAttendance") {
      var logSheet = ss.getSheetByName("سجل الحضور");
      var subject = data.subject || "كتاب مقدس";
      var dateStr = formatDate(data.date);
      var records = data.records;
      
      // جلب الفرق للطلاب من شيت درجات المواد
      var sSheet = ss.getSheetByName("درجات المواد");
      var sRows = sSheet.getDataRange().getValues();
      var studentTeams = {};
      for (var i = 1; i < sRows.length; i++) {
        if (sRows[i][0]) studentTeams[sRows[i][0]] = sRows[i][1] || "غير محدد";
      }
      
      // قراءة كل السجلات
      var logRange = logSheet.getDataRange();
      var logData = logRange.getValues();
      
      records.forEach(function(rec) {
        var team = studentTeams[rec.name] || "غير محدد";
        var norm = normName(rec.name);
        
        var foundRowIndex = -1;
        for (var l = 1; l < logData.length; l++) {
          if (formatDate(logData[l][0]) === dateStr && 
              logData[l][1] === subject && 
              normName(logData[l][3]) === norm) {
            foundRowIndex = l;
            break;
          }
        }
        
        var bonusPoints = Number(rec.bonus) || 0;
        
        if (foundRowIndex !== -1) {
          logData[foundRowIndex][4] = rec.status;
          if (rec.bonus !== undefined) {
            logData[foundRowIndex][5] = bonusPoints;
          }
        } else {
          logData.push([dateStr, subject, team, rec.name, rec.status, bonusPoints]);
        }
      });
      
      logSheet.getRange(1, 1, logData.length, 6).setValues(logData);
      
      recalculateTeamSheetsFromLog(ss);
      result = { status: "success", message: "تم تسجيل الحضور والغياب بنجاح" };
    }
    // ---------- تسجيل بونص ----------
    else if (action === "recordBonus") {
      var logSheet = ss.getSheetByName("سجل الحضور");
      var subject = data.subject || "كتاب مقدس";
      var dateStr = formatDate(data.date);
      var records = data.records;
      
      if (!records && data.name) {
        records = [{ name: data.name, points: Number(data.points) || 0 }];
      }
      
      // جلب الفرق للطلاب
      var sSheet = ss.getSheetByName("درجات المواد");
      var sRows = sSheet.getDataRange().getValues();
      var studentTeams = {};
      for (var i = 1; i < sRows.length; i++) {
        if (sRows[i][0]) studentTeams[sRows[i][0]] = sRows[i][1] || "غير محدد";
      }
      
      var logRange = logSheet.getDataRange();
      var logData = logRange.getValues();
      
      records.forEach(function(rec) {
        var team = studentTeams[rec.name] || "غير محدد";
        var norm = normName(rec.name);
        
        var foundRowIndex = -1;
        for (var l = 1; l < logData.length; l++) {
          if (formatDate(logData[l][0]) === dateStr && 
              logData[l][1] === subject && 
              normName(logData[l][3]) === norm) {
            foundRowIndex = l;
            break;
          }
        }
        
        if (foundRowIndex !== -1) {
          logData[foundRowIndex][5] = rec.points;
        } else {
          logData.push([dateStr, subject, team, rec.name, "", rec.points]);
        }
      });
      
      logSheet.getRange(1, 1, logData.length, 6).setValues(logData);
      
      recalculateTeamSheetsFromLog(ss);
      result = { status: "success", message: "تم تسجيل البونص بنجاح" };
    }
    // ---------- تسجيل درجات المواد ----------
    else if (action === "recordBehavior") {
      var ok = recordSubjectScore(ss, data.name, "السلوكيات", Number(data.score));
      result = ok ? { status: "success", message: "تم تسجيل درجة السلوك بنجاح" }
                  : { status: "error", message: "الطالب غير موجود" };
    }
    else if (action === "recordHymns") {
      var ok = recordSubjectScore(ss, data.name, "الألحان", Number(data.score));
      result = ok ? { status: "success", message: "تم تسجيل درجة الألحان بنجاح" }
                  : { status: "error", message: "الطالب غير موجود" };
    }
    else if (action === "recordCreed") {
      var ok = recordSubjectScore(ss, data.name, "العقيدة", Number(data.score));
      result = ok ? { status: "success", message: "تم تسجيل درجة العقيدة بنجاح" }
                  : { status: "error", message: "الطالب غير موجود" };
    }
    else if (action === "recordHistory") {
      var ok = recordSubjectScore(ss, data.name, "تاريخ الكنيسة", Number(data.score));
      result = ok ? { status: "success", message: "تم تسجيل درجة تاريخ الكنيسة بنجاح" }
                  : { status: "error", message: "الطالب غير موجود" };
    }
    else if (action === "recordBible") {
      var ok = recordSubjectScore(ss, data.name, "الكتاب المقدس", Number(data.score));
      result = ok ? { status: "success", message: "تم تسجيل درجة الكتاب المقدس بنجاح" }
                  : { status: "error", message: "الطالب غير موجود" };
    }
    else if (action === "recordHeroes") {
      var ok = recordSubjectScore(ss, data.name, "أبطال إيمان", Number(data.score));
      result = ok ? { status: "success", message: "تم تسجيل درجة أبطال إيمان بنجاح" }
                  : { status: "error", message: "الطالب غير موجود" };
    }

  } catch (err) {
    result = { status: "error", message: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
                        .setMimeType(ContentService.MimeType.JSON);
}

// --------------------------------------------
// دالة معالجة وتوحيد الأسماء العربية لمنع التكرار بسبب اختلافات الإملاء والمسافات
// --------------------------------------------
function normName(name) {
  if (!name) return "";
  return name.toString().trim()
              .replace(/\s+/g, " ") // دمج المسافات الزائدة
              .replace(/أ/g, "ا").replace(/إ/g, "ا").replace(/آ/g, "ا") // توحيد الألف
              .replace(/ة/g, "ه") // توحيد الهاء والتاء المربوطة
              .replace(/ى/g, "ي"); // توحيد الياء والالف المقصورة
}
