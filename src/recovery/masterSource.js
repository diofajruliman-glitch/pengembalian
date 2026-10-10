// Preview workbooks must never replace committed dashboard or SDM balances.
export function committedMaster(current, candidate){
 return candidate?.source==='database' ? candidate : current
}
