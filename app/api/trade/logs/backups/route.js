import { verifyToken } from '../../middleware';
import { getTradeServerPath } from '../../utils';
import fs from 'fs';
import path from 'path';

// backup_logs 폴더 경로 (trade-server/backup_logs)
const backupLogsDir = getTradeServerPath('backup_logs');

/**
 * DELETE: backup_logs 폴더 안의 모든 파일 삭제
 */
export async function DELETE(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    if (!fs.existsSync(backupLogsDir)) {
      return Response.json({ deleted: 0, message: '백업 로그 폴더가 없습니다.' });
    }

    const names = fs.readdirSync(backupLogsDir);
    let deleted = 0;
    for (const name of names) {
      const filePath = path.join(backupLogsDir, name);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    }

    return Response.json({
      deleted,
      message: deleted > 0 ? `백업 로그 ${deleted}개를 삭제했습니다.` : '삭제할 백업 로그가 없습니다.',
    });
  } catch (error) {
    console.error('백업 로그 삭제 실패:', error);
    return Response.json(
      { error: '백업 로그를 삭제할 수 없습니다.', details: error.message },
      { status: 500 }
    );
  }
}
