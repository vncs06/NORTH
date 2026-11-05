import { describe, expect, it } from 'vitest';
import { northAdminAuditAccess } from './index.js';

describe('contrato do Administrador NORTH', () => {
  it('é separado, temporário, justificado e somente leitura', () => {
    expect(northAdminAuditAccess).toEqual({
      readOnly: true,
      requiresReason: true,
      shortLivedCredential: true,
      separatelyAudited: true,
    });
    expect(Object.keys(northAdminAuditAccess)).not.toContain('canMutate');
  });
});
