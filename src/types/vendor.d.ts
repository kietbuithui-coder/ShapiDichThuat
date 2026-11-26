declare module 'kuromoji' {
  export interface IpadicFeatures {
    word_id: number;
    word_type: string;
    word_position: number;
    surface_form: string;
    pos: string;
    pos_detail_1: string;
    pos_detail_2: string;
    pos_detail_3: string;
    conjugated_type: string;
    conjugated_form: string;
    basic_form: string;
    reading?: string;
    pronunciation?: string;
  }

  export interface Tokenizer<T> {
    tokenize(text: string): T[];
  }

  export interface TokenizerBuilder<T> {
    build(callback: (err: Error | null, tokenizer: Tokenizer<T>) => void): void;
  }

  export function builder(options: { dicPath: string }): TokenizerBuilder<IpadicFeatures>;
  const kuromojiDefault: {
    builder: typeof builder;
  };
  export default kuromojiDefault;
}

declare module 'hanviet-pinyin-words' {
  export function getHanviet(
    tradHanzi: string | string[],
    pinyinWords: string[],
    firstCharUpperCase?: boolean
  ): string;
  export function getAllHanvietsOfChar(tradChar: string): string[];
  export const hanvietData: Record<string, Record<string, string>>;
}

declare module 'segmentit' {
  export class Segment {
    doSegment(text: string, options?: { simple?: boolean; stripPunctuation?: boolean }): string[];
  }
  export function useDefault<T>(segment: T): T;
  const segmentitDefault: {
    Segment: typeof Segment;
    useDefault: typeof useDefault;
  };
  export default segmentitDefault;
}
