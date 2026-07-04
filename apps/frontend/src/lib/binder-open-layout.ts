export type BinderRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const binderSpreadWidth = 1672;
export const binderSpreadHeight = 941;
export const binderSlotCount = 18;
export const binderCardAspectRatio = 59 / 86;

export const binderSlotRects: ReadonlyArray<BinderRect> = [
  { x: 130, y: 70, width: 182, height: 251 },
  { x: 343, y: 70, width: 181, height: 251 },
  { x: 555, y: 71, width: 181, height: 250 },
  { x: 130, y: 348, width: 181, height: 243 },
  { x: 343, y: 348, width: 181, height: 243 },
  { x: 556, y: 348, width: 180, height: 243 },
  { x: 130, y: 620, width: 181, height: 244 },
  { x: 343, y: 620, width: 181, height: 244 },
  { x: 556, y: 620, width: 181, height: 244 },
  { x: 933, y: 70, width: 180, height: 251 },
  { x: 1146, y: 70, width: 183, height: 251 },
  { x: 1360, y: 71, width: 181, height: 250 },
  { x: 933, y: 347, width: 180, height: 244 },
  { x: 1146, y: 348, width: 183, height: 243 },
  { x: 1361, y: 348, width: 180, height: 243 },
  { x: 933, y: 620, width: 180, height: 244 },
  { x: 1145, y: 620, width: 183, height: 244 },
  { x: 1360, y: 620, width: 181, height: 244 },
] as const;

export const binderCardRects: ReadonlyArray<BinderRect> = [
  { x: 142, y: 83, width: 158, height: 227 },
  { x: 355, y: 83, width: 158, height: 227 },
  { x: 568, y: 83, width: 157, height: 227 },
  { x: 142, y: 359, width: 158, height: 222 },
  { x: 355, y: 359, width: 158, height: 222 },
  { x: 567, y: 359, width: 158, height: 222 },
  { x: 142, y: 632, width: 158, height: 222 },
  { x: 355, y: 632, width: 158, height: 222 },
  { x: 567, y: 632, width: 158, height: 222 },
  { x: 944, y: 83, width: 158, height: 227 },
  { x: 1157, y: 83, width: 161, height: 227 },
  { x: 1372, y: 83, width: 158, height: 227 },
  { x: 944, y: 359, width: 157, height: 222 },
  { x: 1157, y: 359, width: 161, height: 222 },
  { x: 1372, y: 359, width: 158, height: 222 },
  { x: 944, y: 632, width: 157, height: 222 },
  { x: 1158, y: 632, width: 158, height: 222 },
  { x: 1372, y: 632, width: 158, height: 222 },
] as const;

export function binderPercentX(value: number) {
  return `${(value / binderSpreadWidth) * 100}%`;
}

export function binderPercentY(value: number) {
  return `${(value / binderSpreadHeight) * 100}%`;
}
