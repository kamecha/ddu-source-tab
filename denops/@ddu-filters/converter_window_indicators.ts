import {
  BaseFilter,
  FilterArguments,
} from "https://deno.land/x/ddu_vim@v3.10.1/base/filter.ts";
import {
  DduFilterItems,
  DduItem,
} from "https://deno.land/x/ddu_vim@v3.10.1/types.ts";
import { isWindowInfo } from "../@ddu-sources/tab.ts";
import { fn } from "https://deno.land/x/ddu_vim@v3.10.1/deps.ts";

type Params = Record<never, never>;

export class Filter extends BaseFilter<Params> {
  override filter(
    args: FilterArguments<Params>,
  ): DduFilterItems | Promise<DduFilterItems> {
    return Promise.all(args.items
      .map(async (item: DduItem) => {
        const action = item.action;
        if (isWindowInfo(action)) {
          const windowIndicator = action.winid == args.context.winId
            ? ">"
            // : action.bufnr == await fn.bufnr(args.denops, "#") なんかこれ微妙に挙動が再現できなくて煩わしいから一旦無効で
            // ? "#"
            : " ";
          const bufinfos = await fn.getbufinfo(args.denops, action.bufnr);
          const bufinfo = bufinfos[0];
          const bufferIndicator = bufinfo["changed"] ? "+" : " ";

          const indicator = `${windowIndicator} ${bufferIndicator} `;
          item.display = item.display ?? item.word;
          item.display = `${indicator}${item.display}`;

          if (item.highlights) {
            const offset = await fn.strlen(args.denops, indicator);
            for (const hl of item.highlights) {
              hl.col += offset;
            }
          }

          return item;
        } else {
          return item;
        }
      }));
  }

  override params(): Params {
    return {};
  }
}
