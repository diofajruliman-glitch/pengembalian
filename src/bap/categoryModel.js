export const CATEGORY_OPTIONS=['Belum dapat disimpulkan','Tidak terbukti','Ringan','Sedang','Berat']
export function categoryState(review,row){
 if(!review)return 'Memuat'
 if(review.review_status==='Belum diisi')return 'Belum diisi'
 const revision=review.review_status==='Ditetapkan'?review.decision_bap_revision:review.proposal_bap_revision
 return revision!==row.revision?'Perlu ditinjau ulang':review.review_status
}
export function initialCategoryForm(review){return {category:review.proposed_category||'',reason:review.reason||'',evidence:review.evidence||'',questionRefs:review.question_refs||[]}}
