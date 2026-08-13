// lunar-javascript 最小类型声明（库本身无 d.ts）
declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar
    toYmd(): string
    getLunar(): Lunar
    getYear(): number
    getMonth(): number
    getDay(): number
  }
  export class Lunar {
    static fromYmd(year: number, month: number, day: number): Lunar
    static fromDate(date: Date): Lunar
    getSolar(): Solar
    toString(): string
  }
}
