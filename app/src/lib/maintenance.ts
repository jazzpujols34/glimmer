// NEXT_PUBLIC_ so the client banner and the server guards read one switch. Next inlines it
// at build time: after changing it in CF Pages, retry the deployment so it is rebuilt.
export const isMaintenance = (): boolean => process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';

export const MAINTENANCE_MESSAGE =
  '影片生成服務維護中，暫停受理新影片與購買點數。已完成的影片可正常觀看、編輯與下載。';
