import {
  isTabInfo,
  isWindowInfo,
  TabInfo,
  WindowInfo,
} from "../@ddu-sources/tab.ts";
import {
  ActionFlags,
  Actions,
  BaseKind,
  DduItem,
  Denops,
  ensure,
  fn,
  is,
  maybe,
  Predicate,
  PreviewContext,
  Previewer,
} from "../deps.ts";

export type ActionData = TabInfo | WindowInfo;

const isActionData: Predicate<ActionData> = is.OneOf([
  isTabInfo,
  isWindowInfo,
]);

type Params = Record<never, never>;

type PreviewParams = {
  border: string[];
  focusBorder: string[];
};

const isPreviewParams: Predicate<PreviewParams> = is.ObjectOf({
  border: is.ArrayOf(is.String),
  focusBorder: is.ArrayOf(is.String),
});

type LeafLayout = ["leaf", number];
type RowLayout = ["row", WindowLayout[]];
type ColLayout = ["col", WindowLayout[]];
type WindowLayout = LeafLayout | RowLayout | ColLayout;

export class Kind extends BaseKind<Params> {
  actions: Actions<Params> = {
    open: async (args: {
      denops: Denops;
      kindParams: Params;
      items: DduItem[];
    }) => {
      for (const item of args.items) {
        if (item.action) {
          const action = ensure(item.action, isActionData);
          if (isTabInfo(action)) {
            await args.denops.cmd(`tabnext ${action.tabnr}`);
          }
          if (isWindowInfo(action)) {
            await fn.win_gotoid(args.denops, action.winid);
          }
        }
      }
      return ActionFlags.None;
    },
    close: async (args: {
      denops: Denops;
      kindParams: Params;
      items: DduItem[];
    }) => {
      // tabnrのずれを補正する
      const tabnrMap: Record<number, { tabnr: number; windows: number[] }> = {};
      const closeTabnr: (
        map: Record<number, { tabnr: number; windows: number[] }>,
        tabnr: number,
      ) => void = (map, tabnr) => {
        map[tabnr] = {
          tabnr: -1,
          windows: [],
        };
        for (const tabInfoIndex in map) {
          if (map[tabInfoIndex].tabnr > tabnr) {
            map[tabInfoIndex].tabnr -= 1;
          }
        }
      };
      const tabinfos = ensure(
        await fn.gettabinfo(args.denops),
        is.ArrayOf(isTabInfo),
      );
      for (const tabinfo of tabinfos) {
        tabnrMap[tabinfo.tabnr] = tabinfo;
      }
      for (const item of args.items) {
        if (item.action) {
          const action = ensure(item.action, isActionData);
          if (isTabInfo(action)) {
            try {
              await args.denops.cmd(`tabclose ${tabnrMap[action.tabnr].tabnr}`);
            } catch (_) {
              // TODO: エラーメッセージが決め打ちなのでちゃんと調べとく
              console.error("E784: Cannot close last tab page");
            }
            closeTabnr(tabnrMap, action.tabnr);
          }
          if (isWindowInfo(action)) {
            try {
              await fn.win_execute(args.denops, action.winid, "close");
            } catch (_) {
              // TODO: エラーメッセージが決め打ちなのでちゃんと調べとく
              console.error("E444: Cannot close last window");
            }
            // 該当するtabnrのwindowsからwinidを削除
            tabnrMap[action.tabnr].windows = tabnrMap[action.tabnr].windows
              .filter(
                (winid) => winid !== action.winid,
              );
            if (tabnrMap[action.tabnr].windows.length === 0) {
              closeTabnr(tabnrMap, action.tabnr);
            }
          }
        }
      }
      return ActionFlags.None;
    },
  };
  params(): Params {
    return {};
  }
  async getPreviewer(args: {
    denops: Denops;
    previewContext: PreviewContext;
    actionParams: unknown;
    item: DduItem;
  }): Promise<Previewer | undefined> {
    const action = args.item.action as ActionData;
    if (!action) {
      return undefined;
    }
    const params = maybe(args.actionParams, isPreviewParams);
    const border = params?.border ?? ["┌", "─", "┐", "│", "┘", "─", "└", "│"];
    const focusBorder = params?.focusBorder ??
      ["╔", "═", "╗", "║", "╝", "═", "╚", "║"];
    const contents: string[] = [];
    // previewContextのheight,widthに沿ってcontentsを初期化
    for (let i = 0; i < args.previewContext.height; i++) {
      contents.push(" ".repeat(args.previewContext.width));
    }
    const winLayout = await fn.winlayout(
      args.denops,
      action.tabnr,
    ) as WindowLayout;
    return {
      kind: "nofile",
      contents: await this.winLayoutPreview(
        args.denops,
        contents,
        winLayout,
        border,
        focusBorder,
        maybe(action, isWindowInfo)?.winid,
      ),
    };
  }
  async winLayoutPreview(
    denops: Denops,
    contents: string[],
    winLayout: WindowLayout,
    border: string[],
    focusBorder: string[],
    winid?: number,
  ): Promise<string[]> {
    if (contents.length === 0) {
      return [];
    }
    const winLayoutPreview: string[] = contents;
    const winLayoutPreviewRec = async (
      winlayout: WindowLayout,
      i: number,
      j: number,
      width: number,
      height: number,
      border: string[],
      focusBorder: string[],
    ) => {
      if (winlayout[0] === "leaf") {
        const bufName = ensure(
          await fn.winbufnr(denops, winlayout[1]),
          is.Number,
        );
        const title = ensure(await fn.bufname(denops, bufName), is.String) ||
          "[No Name]";
        this.leafLayout(
          j,
          i,
          width,
          height,
          title,
          winLayoutPreview,
          (winid && winlayout[1] === winid) ? focusBorder : border,
        );
      }
      if (winlayout[0] === "col") {
        const next_height = Math.floor(height / winlayout[1].length);
        for (let k = 0; k < winlayout[1].length; k++) {
          const next_i = i + next_height * k;
          await winLayoutPreviewRec(
            winlayout[1][k],
            next_i,
            j,
            width,
            next_height,
            border,
            focusBorder,
          );
        }
      }
      if (winlayout[0] === "row") {
        const next_width = Math.floor(width / winlayout[1].length);
        for (let k = 0; k < winlayout[1].length; k++) {
          const next_j = j + next_width * k;
          await winLayoutPreviewRec(
            winlayout[1][k],
            i,
            next_j,
            next_width,
            height,
            border,
            focusBorder,
          );
        }
      }
    };
    await winLayoutPreviewRec(
      winLayout,
      0,
      0,
      contents[0].length,
      contents.length,
      border,
      focusBorder,
    );
    return winLayoutPreview;
  }
  leafLayout(
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    contents: string[],
    border: string[],
  ) {
    // validation
    if (y < 0 || y >= contents.length || x < 0 || x >= contents[0].length) {
      return;
    }
    if (width < 2 || height < 2) {
      return;
    }
    // borderの配列を8つの要素に変換(borderの要素が8より小さいと順に繰り返す)
    // double style
    // [ "╔", "═", "╗", "║", "╝", "═", "╚", "║" ] => [ "╔", "═", "╗", "║", "╝", "═", "╚", "║" ]
    // [ "+", "-", "+", "|" ] => [ "+", "-", "+", "|", "+", "-", "+", "|" ]
    const border8: string[] = [];
    for (let i = 0; i < 8; i++) {
      border8.push(border[i % border.length]);
    }
    // draw
    const limitHeight = Math.min(y + height, contents.length - 1);
    // const limitWidth = Math.min(x + width, contents[0].length - 1);
    for (let i = y; i < limitHeight; i++) {
      if (i === y) {
        contents[i] = contents[i].slice(0, x) + border8[0] +
          border8[1].repeat(width - 2) + border8[2] +
          contents[i].slice(x + width);
      } else if (i === limitHeight - 1) {
        contents[i] = contents[i].slice(0, x) + border8[6] +
          border8[5].repeat(width - 2) + border8[4] +
          contents[i].slice(x + width);
      } else {
        // 中央にtitleを表示
        if (i === Math.floor((y + limitHeight) / 2)) {
          // titleがwidthを越える場合は後ろだけを表示
          if (title.length > width - 2) {
            contents[i] = contents[i].slice(0, x) + border8[7] +
              title.slice(-(width - 2)) + border8[3] +
              contents[i].slice(x + width);
          } else {
            // titleを中央に表示
            const title_x = Math.floor((width - 2 - title.length) / 2);
            contents[i] = contents[i].slice(0, x) + border8[7] +
              " ".repeat(title_x) + title +
              " ".repeat(width - 2 - title.length - title_x) + border8[3] +
              contents[i].slice(x + width);
          }
          continue;
        }
        contents[i] = contents[i].slice(0, x) + border8[7] +
          " ".repeat(width - 2) + border8[3] + contents[i].slice(x + width);
      }
    }
  }
}
