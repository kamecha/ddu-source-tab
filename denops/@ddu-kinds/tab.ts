import { BaseKind } from "https://deno.land/x/ddu_vim@v2.5.0/base/kind.ts";
import { ActionFlags, Actions, DduItem, PreviewContext, Previewer } from "https://deno.land/x/ddu_vim@v2.5.0/types.ts";
import { Denops } from "https://deno.land/x/denops_std@v3.9.0/mod.ts";
import { WindowLayout, LeafLayout } from "../@ddu-sources/tab.ts";
import { fn } from "https://deno.land/x/ddu_vim@v1.13.0/deps.ts";
import { ensureNumber, ensureString } from "https://deno.land/x/unknownutil@v2.1.0/mod.ts";

export interface ActionData {
  tabnr: number;
}

type Params = Record<never, never>;

export class Kind extends BaseKind<Params> {
  actions: Actions<Params> = {
    open: async (args: {
      denops: Denops;
      items: DduItem[];
    }) => {
      for (const item of args.items) {
        if (item.action) {
          const action = item.action as ActionData;
          await args.denops.cmd(`tabnext ${action.tabnr}`);
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
    item: DduItem;
  }): Promise<Previewer | undefined> {
    const action = args.item.action as ActionData;
    if (!action) {
      return undefined;
    }
    const contents: string[] = [];
    // previewContextのheight,widthに沿ってcontentsを初期化
    for (let i = 0; i < args.previewContext.height; i++) {
      contents.push(" ".repeat(args.previewContext.width));
    }
    const winLayout = await fn.winlayout(args.denops, action.tabnr) as WindowLayout;
    return {
      kind: "nofile",
      contents: await this.winLayoutPreview(args.denops, contents, winLayout)
    }
  }
  async winLayoutPreview(denops: Denops, contents: string[], winLayout: WindowLayout): Promise<string[]> {
    if (contents.length === 0) {
      return [];
    }
    const winLayoutPreview: string[] = contents;
    const leafLayout = (x: number, y: number, width: number, height: number, title: string) => {
      // validation
      if (y < 0 || y >= contents.length || x < 0 || x >= contents[0].length) {
        return;
      }
      if (width <= 0 ||  height <= 0) {
        return;
      }
      // draw
      const limitHeight = Math.min(y + height, contents.length - 1);
      // const limitWidth = Math.min(x + width, contents[0].length - 1);
      for (let i = y; i < limitHeight; i++) {
        if ( i === y ) {
          winLayoutPreview[i] = winLayoutPreview[i].slice(0, x) + "┌" + "─".repeat(width - 2) + "┐" + winLayoutPreview[i].slice( x + width );
        } else if ( i === limitHeight - 1 ) {
          winLayoutPreview[i] = winLayoutPreview[i].slice(0, x) + "└" + "─".repeat(width - 2) + "┘" + winLayoutPreview[i].slice( x + width );
        } else {
          // 中央にtitleを表示
          if ( i === Math.floor( (y + limitHeight) / 2 ) ) {
            // titleがwidthを越える場合は後ろだけを表示
            if ( title.length > width - 2 ) {
              winLayoutPreview[i] = winLayoutPreview[i].slice(0, x) + "│" + title.slice(-(width - 2)) + "│" + winLayoutPreview[i].slice( x + width );
            } else {
              // titleを中央に表示
              const title_x = Math.floor( (width - title.length) / 2 );
              winLayoutPreview[i] = winLayoutPreview[i].slice(0, x) + "│" + " ".repeat(title_x) + title + " ".repeat(width - 2 - title_x - title.length) + "│" + winLayoutPreview[i].slice( x + width );
            }
            continue;
          }
          winLayoutPreview[i] = winLayoutPreview[i].slice(0, x) + "│" + " ".repeat(width - 2) + "│" + winLayoutPreview[i].slice( x + width );
        }
      }
    }
    const winLayoutPreviewRec = async (
      winlayout: WindowLayout,
      i: number,
      j: number,
      width: number,
      height: number,
    ) => {
      if (winlayout[0] === "leaf") {
        const bufName = ensureNumber(await fn.winbufnr(denops, winlayout[1]));
        const title = ensureString( await fn.bufname(denops, bufName) );
        leafLayout(j, i, width, height, title);
      }
      if (winlayout[0] === "col") {
        const next_height = Math.floor( height / winlayout[1].length );
        for (let k = 0; k < winlayout[1].length; k++) {
          const next_i = i + next_height * k;
          await winLayoutPreviewRec(winlayout[1][k], next_i, j, width, next_height);
        }
      }
      if (winlayout[0] === "row") {
        const next_width = Math.floor( width / winlayout[1].length );
        for (let k = 0; k < winlayout[1].length; k++) {
          const next_j = j + next_width * k;
          await winLayoutPreviewRec(winlayout[1][k], i, next_j, next_width, height);
        }
      }
    }
    await winLayoutPreviewRec(winLayout, 0, 0, contents[0].length, contents.length);
    return winLayoutPreview;
  }
}
