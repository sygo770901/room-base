/** 這一幀的預測座標。鏡頭和自己的模型都讀它，避免 React 狀態晚一幀、人被落在鏡頭後面。 */
export const livePose = {
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  ready: false,
}
