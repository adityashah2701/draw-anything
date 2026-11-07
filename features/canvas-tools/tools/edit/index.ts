import { updateShapeStyle, changeShape, updateIcon, updateSemanticNode } from "./style-tool";
import { updateText } from "./label-tool";
import { updateElement } from "./element-tool";
import { moveElements, resizeElement, rotateElements } from "./transform-tool";
import { lockElements, unlockElements, hideElements, showElements } from "./visibility-tool";
import { reorderElements } from "./order-tool";
import { deleteElements } from "./delete-tool";

export {
  updateShapeStyle,
  changeShape,
  updateIcon,
  updateSemanticNode,
  updateText,
  updateElement,
  moveElements,
  resizeElement,
  rotateElements,
  lockElements,
  unlockElements,
  hideElements,
  showElements,
  reorderElements,
  deleteElements,
};

export const EDIT_TOOLS = [
  updateElement,
  changeShape,
  updateText,
  updateIcon,
  updateSemanticNode,
  updateShapeStyle,
  moveElements,
  resizeElement,
  rotateElements,
  lockElements,
  unlockElements,
  hideElements,
  showElements,
  reorderElements,
  deleteElements,
] as const;

