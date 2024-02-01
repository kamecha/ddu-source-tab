import { BaseSource, ensure, fn, is, Item } from "../deps.ts";
import type {
  DduOptions,
  Denops,
  GatherArguments,
  Predicate,
} from "../deps.ts";
import { ActionData } from "../@ddu-kinds/tab.ts";

type Params = {
  format: string;
};

export type TabInfo = {
  tabnr: number;
  variables: Record<string, unknown>;
  windows: number[];
};

export const isTabInfo: Predicate<TabInfo> = is.ObjectOf({
  tabnr: is.Number,
  variables: is.RecordOf(is.Unknown),
  windows: is.ArrayOf(is.Number),
});

export type WindowInfo = {
  botline: number;
  bufnr: number;
  height: number;
  loclist: number;
  quickfix: number;
  terminal: number;
  tabnr: number;
  topline: number;
  variables: Record<string, unknown>;
  width: number;
  winbar: number;
  wincol: number;
  textoff: number;
  winid: number;
  winnr: number;
  winrow: number;
};

export const isWindowInfo: Predicate<WindowInfo> = is.ObjectOf({
  botline: is.Number,
  bufnr: is.Number,
  height: is.Number,
  loclist: is.Number,
  quickfix: is.Number,
  terminal: is.Number,
  tabnr: is.Number,
  topline: is.Number,
  variables: is.RecordOf(is.Unknown),
  width: is.Number,
  winbar: is.Number,
  wincol: is.Number,
  textoff: is.Number,
  winid: is.Number,
  winnr: is.Number,
  winrow: is.Number,
});

async function getBufName(denops: Denops, tabinfo: TabInfo): Promise<string[]> {
  const bufnames: string[] = [];
  for (const winid of tabinfo.windows) {
    const wininfo = await fn.getwininfo(denops, winid) as WindowInfo[];
    if (wininfo.length === 0) continue;
    const bufname = ensure(
      await fn.bufname(denops, wininfo[0].bufnr),
      is.String,
    );
    bufnames.push(bufname);
  }
  return bufnames;
}

async function checkTabby(denops: Denops, text: string): Promise<void> {
  if (text.includes("%T")) {
    await denops.call(
      "ddu#util#print_error",
      "tabby format (%T) is deprecated",
    );
  }
}

// ↓luaでこれを書くとtabの名前が取れる
/*
lua << EOF
local tab = require('tabby.tab')
print(tab.get_name(1))
EOF
*/
async function getTabName(denops: Denops, tabnr: number): Promise<string> {
  if (
    !(
      await fn.has(denops, "nvim") &&
      await denops.eval(
        `luaeval('type(select(2, pcall(require, "tabby")))') == "table"`,
      )
    )
  ) {
    return "";
  }
  try {
    const tabPages = ensure(
      await denops.call("ddu#source#tab#get_tabpages"),
      is.ArrayOf(is.Number),
    );
    const tabName = await denops.call(
      "ddu#source#tab#get_tab_name",
      tabPages[tabnr - 1],
    );
    return ensure(tabName, is.String);
  } catch (e) {
    console.log(e);
    return "";
  }
}

async function isDduWindowId(denops: Denops, winid: number): Promise<boolean> {
  const currentDduOptions =
    (await denops.call("ddu#custom#get_current")) as Partial<
      DduOptions
    >;
  const dduWinIds: number[] = ensure(
    await denops.call(
      "ddu#ui#winids",
      currentDduOptions["name"],
    ),
    is.ArrayOf(is.Number),
  );
  return dduWinIds.includes(winid);
}

export class Source extends BaseSource<Params> {
  override kind = "tab";

  override gather(
    args: GatherArguments<Params>,
  ): ReadableStream<Item<ActionData>[]> {
    return new ReadableStream({
      async start(controller) {
        if (args.parent === undefined) {
          controller.enqueue(await Source.prototype.gatherTab(args));
        } else {
          const parentAction = ensure(args.parent.action, isTabInfo);
          const tabinfos = ensure(
            await fn.gettabinfo(args.denops, parentAction.tabnr),
            is.ArrayOf(isTabInfo),
          );
          if (tabinfos.length === 0) return;
          const tabinfo = tabinfos[0];
          controller.enqueue(
            await Source.prototype.gatherWindow(args, tabinfo),
          );
        }
        controller.close();
      },
    });
  }

  override params(): Params {
    return {
      format: "tab(%n): %N window",
    };
  }

  async gatherTab(args: GatherArguments<Params>): Promise<Item<TabInfo>[]> {
    const items: Item<TabInfo>[] = [];
    const tabinfos = ensure(
      await fn.gettabinfo(args.denops),
      is.ArrayOf(isTabInfo),
    );
    for (const tabinfo of tabinfos) {
      // word内にtabName([Float])とかが入るとeditがうまくいかない
      const tabName = await getTabName(args.denops, tabinfo.tabnr);
      const bufnames = await getBufName(args.denops, tabinfo);
      const regexp = new RegExp("(\s|\t|\n|\v)", "g");
      checkTabby(args.denops, args.sourceParams.format);
      const filteredWindows: number[] = [];
      for (const winid of tabinfo.windows) {
        const flag = await isDduWindowId(args.denops, winid);
        if (!flag) filteredWindows.push(winid);
      }
      const text: string = args.sourceParams.format
        .replaceAll(regexp, " ")
        .replaceAll("%n", tabinfo.tabnr.toString())
        .replaceAll("%N", filteredWindows.length.toString())
        // deprecated
        .replaceAll("%T", tabName)
        .replaceAll("%w", bufnames.join(" "));
      items.push({
        word: text,
        action: tabinfo,
        // treePath & isTree are needed to fire expandItem action
        // not only for isTree
        treePath: tabinfo.tabnr.toString(),
        isTree: true,
      });
    }
    return items;
  }

  async gatherWindow(
    args: GatherArguments<Params>,
    tabinfo: TabInfo,
  ): Promise<Item<WindowInfo>[]> {
    const items: Item<WindowInfo>[] = [];
    for (const winid of tabinfo.windows) {
      const wininfos = ensure(
        await fn.getwininfo(args.denops, winid),
        is.ArrayOf(isWindowInfo),
      );
      if (wininfos.length === 0) continue;
      const wininfo = wininfos[0];
      if (await isDduWindowId(args.denops, wininfo.winid)) continue;
      const bufname = ensure(
        await fn.bufname(args.denops, wininfo.bufnr),
        is.String,
      );
      items.push({
        word: `${wininfo.winnr}: ${bufname || "[No Name]"}`,
        action: wininfo,
      });
    }
    return items;
  }
}
