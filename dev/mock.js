'use strict';

/**
 * Stand-in for the Tableau Extensions API, for previewing the extension in a
 * normal browser (dev/preview.html). Loaded only when the page URL has ?mock.
 *
 * - Settings live in localStorage, so the chart and the Format dialog (two
 *   frames) see each other's changes, like they do inside Tableau.
 * - Sample data: ?data=figma | breakdown | negative | raw
 */
(function () {
  var params = new URLSearchParams(location.search);
  var DS_KEY = 'wfMockData';
  var SET_KEY = 'wfMockSettings';
  var PAYLOAD_KEY = 'wfMockPayload';

  function m (name) { return { name: name, id: '[' + name + ']' }; }

  // Opening → closing balance from balance-flow-figma.html (SAR M)
  var FIGMA = {
    start: ['SUM(Opening Balance)', 1284.5],
    steps: [
      ['SUM(Bank In)', 262.1], ['SUM(Wallet In)', 36.3], ['SUM(Top-up)', 74.3], ["SUM(Int'l In)", 21.6],
      ['SUM(Reversal)', 18.3], ['SUM(Other Bank Out)', -201.4], ['SUM(Wallet Out)', -48.7],
      ['SUM(Card Txns)', -72.9], ['SUM(SADAD)', -31.2], ['SUM(Loan)', -18.6], ["SUM(Int'l Out)", -13.3]
    ],
    end: ['SUM(Closing Balance)', 1311.0]
  };

  var DATASETS = {
    figma: { def: FIGMA },
    raw: { def: FIGMA, scale: 1e6 },
    breakdown: {
      def: {
        start: FIGMA.start,
        steps: FIGMA.steps.slice(0, 2).concat(FIGMA.steps.slice(5, 8)),
        end: ['SUM(Closing Balance)', 1284.5 + 262.1 + 36.3 - 201.4 - 48.7 - 72.9]
      },
      // [dimension names, combinations, weights]
      breakdown: [['Account Type', 'Segment'],
        [['Current', 'Retail'], ['Current', 'SME'], ['Ehsan', 'Retail'], ['Musaned', 'Retail'], ['Savings', 'Retail'], ['Savings', 'SME']],
        [0.4, 0.15, 0.15, 0.1, 0.12, 0.08]]
    },
    negative: {
      def: {
        start: ['SUM(Net Position)', 40],
        steps: [['SUM(Inflow)', 25], ['SUM(Outflow)', -95], ['SUM(FX)', 12], ['SUM(Fees)', -8]],
        end: ['SUM(Net Position End)', -26]
      }
    }
  };

  var dsName = params.get('data') || localStorage.getItem(DS_KEY) || 'figma';
  var DS = DATASETS[dsName] || DATASETS.figma;

  function cell (v, fmt) {
    return { value: v, nativeValue: v, formattedValue: fmt != null ? fmt : (typeof v === 'number' ? v.toLocaleString('en-US') : String(v)) };
  }

  function buildTable () {
    var d = DS.def;
    var k = DS.scale || 1;
    var measures = [d.start].concat(d.steps, [d.end]);
    var columns = [];
    var bd = DS.breakdown;
    if (bd) bd[0].forEach(function (d) { columns.push({ fieldName: d, fieldId: '[' + d + ']', index: columns.length }); });
    measures.forEach(function (ms) { columns.push({ fieldName: ms[0], fieldId: '[' + ms[0] + ']', index: columns.length }); });
    var data = [];
    if (bd) {
      bd[1].forEach(function (member, mi) {
        var row = member.map(function (x) { return cell(x); });
        measures.forEach(function (ms, j) {
          // vary the split a little per measure so segments differ
          var w = bd[2][mi] * (1 + 0.25 * Math.sin(j * 1.7 + mi));
          var tot = bd[2].reduce(function (s, x, q) { return s + x * (1 + 0.25 * Math.sin(j * 1.7 + q)); }, 0);
          row.push(cell(ms[1] * k * w / tot));
        });
        data.push(row);
      });
    } else {
      var row = [];
      measures.forEach(function (ms) { row.push(cell(ms[1] * k)); });
      data.push(row);
    }
    return { columns: columns, data: data };
  }

  function encodings () {
    var d = DS.def;
    var enc = [{ id: 'start', field: m(d.start[0]) }];
    d.steps.forEach(function (s) { enc.push({ id: 'steps', field: m(s[0]) }); });
    enc.push({ id: 'end', field: m(d.end[0]) });
    if (DS.breakdown) DS.breakdown[0].forEach(function (d) { enc.push({ id: 'breakdown', field: m(d) }); });
    return enc;
  }

  // ---- settings ----------------------------------------------------------
  function loadSettings () {
    try { return JSON.parse(localStorage.getItem(SET_KEY) || '{}'); } catch (e) { return {}; }
  }
  var pending = loadSettings();
  var settingsHandlers = [];
  window.addEventListener('storage', function (e) {
    if (e.key === SET_KEY) {
      pending = loadSettings();
      settingsHandlers.forEach(function (h) { h({}); });
    }
  });

  var configureFn = null;
  var dialogResolve = null;
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'wf-dialog-closed' && dialogResolve) { dialogResolve(''); dialogResolve = null; }
    if (e.data && e.data.type === 'wf-configure' && configureFn) configureFn();
  });

  window.tableau = {
    TableauEventType: { SummaryDataChanged: 'summary-data-changed', SettingsChanged: 'settings-changed' },
    DialogStyle: { Modeless: 'modeless' },
    ErrorCodes: { DialogClosedByUser: 'dialog-closed-by-user' },
    extensions: {
      initializeAsync: function (opts) {
        configureFn = opts && opts.configure;
        window.__wfConfigure = configureFn;
        return Promise.resolve();
      },
      initializeDialogAsync: function () {
        return Promise.resolve(localStorage.getItem(PAYLOAD_KEY) || '');
      },
      settings: {
        get: function (k) { return pending[k]; },
        set: function (k, v) { pending[k] = v; },
        getAll: function () { return pending; },
        saveAsync: function () {
          localStorage.setItem(SET_KEY, JSON.stringify(pending));
          // storage events don't fire in the frame that wrote, so notify it too
          settingsHandlers.forEach(function (h) { h({}); });
          return Promise.resolve();
        },
        addEventListener: function (type, h) { settingsHandlers.push(h); }
      },
      worksheetContent: {
        worksheet: {
          name: 'Mock sheet',
          addEventListener: function () {},
          getVisualSpecificationAsync: function () {
            return Promise.resolve({ activeMarksSpecificationIndex: 0, marksSpecifications: [{ encodings: encodings() }] });
          },
          getSummaryDataReaderAsync: function () {
            var t = buildTable();
            return Promise.resolve({
              getAllPagesAsync: function () { return Promise.resolve(t); },
              releaseAsync: function () { return Promise.resolve(); }
            });
          }
        }
      },
      ui: {
        displayDialogAsync: function (url, payload) {
          localStorage.setItem(PAYLOAD_KEY, payload || '');
          var target = window.parent !== window ? window.parent : null;
          if (target) target.postMessage({ type: 'wf-open-dialog', url: url }, '*');
          else window.open(url, 'wf-dialog', 'width=600,height=760');
          return new Promise(function (resolve) { dialogResolve = resolve; });
        },
        closeDialog: function () {
          if (window.parent !== window) window.parent.postMessage({ type: 'wf-close-dialog' }, '*');
          else window.close();
        }
      }
    }
  };
})();
