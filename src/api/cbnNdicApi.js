// src/api/cbnNdicApi.js
import apiClient from './apiClient.js';

export function apiError(err) {
  return {
    message: err?.message || 'Request failed',
    code:    err?.code    || 'UNKNOWN',
    status:  err?.status,
    details: err?.details || null,
  };
}

if (!apiClient.cbnNdic) {
  console.error(
    '[cbnNdicApi] apiClient.cbnNdic is undefined. ' +
    'Add the `const cbnNdic = {…}` block and ' +
    '`apiClient.cbnNdic = cbnNdic;` line to src/api/apiClient.js.'
  );
}

const _impl = apiClient.cbnNdic || {};

function _missing(name) {
  return function () {
    return Promise.reject(new Error(
      `cbnNdicApi.${name}: apiClient.cbnNdic is undefined — see console for details.`
    ));
  };
}

export const cbnNdicApi = {
  // Canonical names (mirror apiClient.cbnNdic)
  list:           _impl.list           || _missing('list'),
  getById:        _impl.getById        || _missing('getById'),
  getRows:        _impl.getRows        || _missing('getRows'),
  generate:       _impl.generate       || _missing('generate'),
  markSpooled:    _impl.markSpooled    || _missing('markSpooled'),
  markSubmitted:  _impl.markSubmitted  || _missing('markSubmitted'),
  markConfirmed:  _impl.markConfirmed  || _missing('markConfirmed'),
  markRejected:   _impl.markRejected   || _missing('markRejected'),
  revoke:         _impl.revoke         || _missing('revoke'),
  summary:        _impl.summary        || _missing('summary'),
  download:       _impl.download       || _missing('download'),

  // Aliases used by the hooks in useCbnNdic.js
  listBatches:    _impl.list           || _missing('listBatches'),
  getBatch:       _impl.getById        || _missing('getBatch'),
  generateBatch:  _impl.generate       || _missing('generateBatch'),
  downloadBatch:  _impl.download       || _missing('downloadBatch'),
};

export default cbnNdicApi;