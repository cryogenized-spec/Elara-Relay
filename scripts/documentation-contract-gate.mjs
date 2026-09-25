import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const findings = [];

const requiredFiles = [
  'documents/README.md',
  'documents/Layout_Guide.md',
  'documents/Product_Direction.md',
  'documents/Build_History.md',
  'documents/architecture/Supabase_Runtime.md',
  'documents/domains/Repairs_Domain.md',
  'documents/domains/Scheduler_Domain.md',
  'documents/research/UI_Research_2026-09-24.md',
  'documents/milestones/2026-09-24_1101_SAST_Pass-0_Fortress-Floor.md',
  'documents/milestones/2026-09-24_1246_SAST_Pass-1A_Transactional-Domain-Kernel.md',
  'documents/milestones/2026-09-24_1425_SAST_Pass-1B_Persistent-PostgreSQL-Runtime.md',
  'documents/milestones/2026-09-24_1542_SAST_Pass-1C_Authentication-Boundary.md',
  'documents/milestones/2026-09-24_1626_SAST_Pass-1D_Repairs-Domain.md',
  'documents/milestones/2026-09-24_1728_SAST_Pass-1E_Scheduler-Kernel.md',
  'documents/milestones/2026-09-24_1954_SAST_Documentation-Baseline.md',
];

for (const path of requiredFiles) {
  if (!existsSync(join(root, path))) {
    findings.push(`missing canonical documentation file: ${path}`);
  }
}

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

const layout = read('documents/Layout_Guide.md');
for (const marker of [
  '360 × 640 px (9:16)',
  '412 × 915 px Android portrait',
  'Iconify — no Lucide icons',
  '@iconify-icon/react',
  'Phosphor via Iconify',
  '44 × 44 px',
  'color-scheme: dark',
  'Vercel Web Interface Guidelines',
  'Supabase Design System',
]) {
  if (!layout.includes(marker)) {
    findings.push(`Layout_Guide.md lost required design contract: ${marker}`);
  }
}

const direction = read('documents/Product_Direction.md');
for (const marker of [
  'AI is an enhancement layer, not the foundation.',
  'Phase 1 finish line',
  'Today',
  'Repairs',
  'Schedule',
  'Search',
  'Capture',
  'Backup, export & restore',
  'Phase 1 kill-test & freeze',
  'Iconify icons only',
]) {
  if (!direction.includes(marker)) {
    findings.push(`Product_Direction.md lost required direction: ${marker}`);
  }
}

const history = read('documents/Build_History.md');
for (const sha of [
  'b3074625500956959111286a23e61c8e0465e49b',
  'a689b5f980ef32cfac486df134334e3fcb2be5cf',
  '2d3c43a4fb771e0e8a58b56d7e1c6313361b6a69',
  '5d7ff854d155ca26eb3d1f6afb2753f83933a726',
  '4badbf3d47be501c67ea3e7c18612e713f6c98c9',
  '3cc6ab90cfec2657cc18d6f0155a0c064ef1d2fb',
]) {
  if (!history.includes(sha)) {
    findings.push(`Build_History.md lost merged milestone commit: ${sha}`);
  }
}
if (!history.includes('SAST (UTC+02:00)')) {
  findings.push('Build_History.md must retain explicit SAST timestamp semantics');
}

const research = read('documents/research/UI_Research_2026-09-24.md');
for (const source of [
  'https://vercel.com/design/guidelines',
  'https://supabase.com/design-system',
  'https://github.com/iconify/iconify',
  'https://iconify.design/docs/iconify-icon/',
]) {
  if (!research.includes(source)) {
    findings.push(`UI research lost authoritative source: ${source}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(
    `Documentation contract gate failed (${findings.length}):\n${findings
      .map((finding) => `- ${finding}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  'Documentation contract gate passed: canonical documents tree, UI contract, product direction, authoritative research, and timestamped build history are intact.\n',
);
