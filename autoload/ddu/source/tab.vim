" tabbyのlua関数をvimscriptでラップする
function! ddu#source#tab#get_tab_name(tabid) abort
  return luaeval(
        \ 'require("ddu-source-tab").get_tab_name(_A.tabid)',
        \ #{ tabid: a:tabid })
endfunction

function ddu#source#tab#get_tabpages() abort
  return luaeval('require("ddu-source-tab").get_tabpages()')
endfunction
