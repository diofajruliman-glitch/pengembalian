export function interviewEditorState(row,role,userId){
 const canManage=['admin','editor','interviewer'].includes(role)
 const completed=row.status==='Selesai',paused=row.status==='Tertunda'
 const owned=row.locked_by===userId,available=!row.locked_by||owned
 return {paused,completed,canManage,showBap:Boolean(row.started_at),
  readOnly:!canManage||completed||paused||!row.started_at||!owned,
  canStart:canManage&&!completed&&available&&(!row.started_at||paused||!row.locked_by),
  canDefer:canManage&&!completed&&!paused&&available}
}

// Pausing saves the handler's pending BAP in the same revision transaction.
// A pre-start pause only records the reason; it must not manufacture answers.
export function deferInterviewPayload(row,identity,answers,reason,userId){
 const payload={reason:reason.trim()}
 if(row.started_at&&row.status!=='Tertunda'&&row.locked_by===userId){payload.identity=identity;payload.answers=answers}
 return payload
}
