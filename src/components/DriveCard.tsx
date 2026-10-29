import { CloudUpload, ExternalLink } from "lucide-react";
import { disconnectGoogleDrive, exportWaitingToDrive, organiseDriveExports } from "@/app/actions";
import { DRIVE_FOLDER_NAME } from "@/lib/driveExport";
import { ActionForm, ConfirmAction } from "./client";

type Status = { configured: false } | { configured: true; connected: boolean; account: string | null; folderUrl: string | null };

/** Admin card for copying approved jobs (recording and final transcript) into a Google Drive folder. */
export default function DriveCard({ status, waiting, failed, error }: { status: Status; waiting: number; failed: number; error?: string }) {
  return (
    <section className="card" id="drive">
      <div className="card-header">
        <CloudUpload className="size-4.5 text-brand-600" />
        <h2 className="card-title">Google Drive</h2>
      </div>
      <div className="card-body space-y-3">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-600/15">{error}</p>}
        {!status.configured ? (
          <p className="text-sm text-slate-600">
            Approved jobs can be copied to Google Drive automatically. To turn this on, add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the app&apos;s settings on Render.
          </p>
        ) : !status.connected ? (
          <>
            <p className="text-sm text-slate-600">
              Connect a Google account and every job you approve is copied there: its recording and final transcript, in a folder called &ldquo;{DRIVE_FOLDER_NAME}&rdquo;.
            </p>
            <a href="/api/drive-export/connect" className="btn w-full">Connect Google Drive</a>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Approved jobs are copied to {status.account ? <span className="font-medium text-slate-900">{status.account}</span> : "your Google Drive"}.
            </p>
            <p className="text-sm text-slate-500">Exports are organised by group, with each job&apos;s recording and transcript together. Ungrouped jobs stay directly in &ldquo;{DRIVE_FOLDER_NAME}&rdquo;.</p>
            {status.folderUrl && (
              <a href={status.folderUrl} target="_blank" rel="noreferrer" className="btn-secondary w-full">
                <ExternalLink className="size-4" /> Open the Drive folder
              </a>
            )}
            {waiting > 0 && (
              <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                <p className="text-sm text-slate-600">
                  {waiting} approved job{waiting === 1 ? " isn't" : "s aren't"} in Drive yet{failed ? `, ${failed} because copying failed` : ""}.
                </p>
                <ActionForm action={exportWaitingToDrive}>
                  <button className="btn-secondary w-full">Copy {waiting} job{waiting === 1 ? "" : "s"} to Drive</button>
                </ActionForm>
              </div>
            )}
            <ActionForm action={organiseDriveExports} confirm={{
              title: "Organise existing Drive exports?",
              description: "Move approved jobs into their group folders and refresh their transcripts. Recordings already in Drive are reused. Jobs without a group stay in the main export folder.",
              label: "Organise exports",
            }}>
              <button className="btn-secondary w-full">Organise existing exports by group</button>
            </ActionForm>
            <ConfirmAction
              action={disconnectGoogleDrive}
              fields={{}}
              trigger="Disconnect"
              triggerClassName="text-sm font-medium text-slate-500 hover:text-slate-700"
              title="Disconnect Google Drive?"
              description="Jobs you approve from now on aren't copied to Drive. Everything already copied stays there."
              confirmLabel="Disconnect"
            />
          </>
        )}
      </div>
    </section>
  );
}
