import EditableShape from '@recogito/annotorious/src/tools/EditableShape';
import { SVG_NAMESPACE } from '@recogito/annotorious/src/util/SVG';
import { drawEmbeddedSVG } from '@recogito/annotorious/src/selectors/EmbeddedSVG';
import { format, setFormatterElSize } from '@recogito/annotorious/src/util/Formatting';
import Mask from '@recogito/annotorious/src/tools/polygon/PolygonMask';

import { toSVGTarget } from './ImRubberbandPolygonTool';

const getPoints = shape =>
  Array.from(shape.querySelector('.a9s-inner').points);

const getBBox = shape =>
  shape.querySelector('.a9s-inner').getBBox();

export default class ImEditablePolygon extends EditableShape {

  constructor(annotation, g, config, env) {
    super(annotation, g, config, env);

    this.svg.addEventListener('mousemove', this.onMouseMove);
    this.svg.addEventListener('mouseup', this.onMouseUp);

    // Container wraps the mask + editable shape
    this.container = document.createElementNS(SVG_NAMESPACE, 'g');

    // The editable shape group
    this.shape = drawEmbeddedSVG(annotation);
    this.shape.setAttribute('class', 'a9s-annotation editable selected');

    const innerPolygon = this.shape.querySelector('.a9s-inner');
    innerPolygon.addEventListener('mousedown', this.onGrab(this.shape));

    // Mask
    this.mask = new Mask(env.image, innerPolygon);

    this.container.appendChild(this.mask.element);
    this.container.appendChild(this.shape);

    const corners = getPoints(this.shape);

    // Corner handles
    this.cornerHandles = corners.map(pt => {
      const handle = this.drawHandle(pt.x, pt.y);
      handle.addEventListener('mousedown', this.onGrab(handle));

      this.shape.appendChild(handle);

      return handle;
    });

    // Midpoint handles
    this.midpointHandles = [];

    for (let i=0; i<corners.length; i++) {
      // Create point between this and previous corner
      const thisCorner = corners[i];
      const nextCorner = i === corners.length - 1 ? corners[0] : corners[i + 1];

      const x = (thisCorner.x + nextCorner.x) / 2;
      const y = (thisCorner.y + nextCorner.y) / 2;

      const handle = this.drawMidpoint(x, y);
      handle.addEventListener('click', this.onAddPoint({x, y}, i));

      this.shape.appendChild(handle);
      this.midpointHandles.push(handle);
    }

    g.appendChild(this.container);

    // Format needs to go after everything is added to the DOM
    format(this.shape, annotation, config.formatter);

    // Grabbed element and grab offset
    this.grabbedElement = null;
    this.grabbedAt = null;
  }

  destroy = () => {
    this.container.parentNode.removeChild(this.container);
    super.destroy();
  }

  drawMidpoint = (x, y) => {
    const handle = document.createElementNS(SVG_NAMESPACE, 'circle');
    handle.setAttribute('class', 'a9s-midpoint-handle');
    
    handle.setAttribute('cx', x);
    handle.setAttribute('cy', y);
    handle.setAttribute('r', 5);

    return handle;
  }

  get element() {
    return this.shape;
  }

  onAddPoint = (pt, idx) => {

  }

  onGrab = element => evt => {
    if (evt.button !== 0) return;  // left click
    this.grabbedElement = element;
    this.grabbedAt = this.getSVGPoint(evt);
  }

  onMoveShape = pos => {
    const constrain = (coord, delta, max) =>
      coord + delta < 0 ? -coord : (coord + delta > max ? max - coord : delta);
  
    const { x, y, width, height } = getBBox(this.shape);
    const { naturalWidth, naturalHeight } = this.env.image;

    const dx = constrain(x, pos.x - this.grabbedAt.x, naturalWidth - width);
    const dy = constrain(y, pos.y - this.grabbedAt.y, naturalHeight - height);

    const updatedPoints = getPoints(this.shape).map(pt =>
      ({ x: pt.x + dx, y: pt.y + dy }));

    this.grabbedAt = pos;

    // Update shape
    this.setPoints(updatedPoints);
  }

  onMoveCornerHandle = pos => {
    const handleIdx = this.cornerHandles.indexOf(this.grabbedElement);

    const updatedPoints = getPoints(this.shape).map((pt, idx) =>
      (idx === handleIdx) ? pos : pt);

    this.setPoints(updatedPoints);
  }

  onMouseMove = evt => {
    if (this.grabbedElement) {
      const pos = this.getSVGPoint(evt);

      if (this.grabbedElement === this.shape) {
        this.onMoveShape(pos);
      } else {
        this.onMoveCornerHandle(pos);
      }

      const points = getPoints(this.shape).map(({x, y}) => [x, y]);
      this.emit('update', toSVGTarget(points, this.env.image));
    }
  }

  onMouseUp = evt => {
    this.grabbedElement = null;
    this.grabbedAt = null;
  }

  onRemovePoint = idx => {

  }

  setPoints = points => {
    // Not using .toFixed(1) because that will ALWAYS
    // return one decimal, e.g. "15.0" (when we want "15")
    const round = num =>
      Math.round(10 * num) / 10;

    // Set polygon points
    const str = points.map(pt => `${round(pt.x)},${round(pt.y)}`).join(' ');

    const inner = this.shape.querySelector('.a9s-inner');
    inner.setAttribute('points', str);

    const outer = this.shape.querySelector('.a9s-outer');
    outer.setAttribute('points', str);

    // Corner handles
    points.forEach((pt, idx) => this.setHandleXY(this.cornerHandles[idx], pt.x, pt.y));

    // Midpoints 
    for (let i=0; i<points.length; i++) {
      const thisCorner = points[i];
      const nextCorner = i === points.length - 1 ? points[0] : points[i + 1];

      const x = (thisCorner.x + nextCorner.x) / 2;
      const y = (thisCorner.y + nextCorner.y) / 2;
      
      const handle = this.midpointHandles[i];
      handle.setAttribute('cx', x);
      handle.setAttribute('cy', y);
    }

    // Mask
    this.mask.redraw();

    // Resize formatter elements
    const { x, y, width, height } = outer.getBBox();
    setFormatterElSize(this.shape, x, y, width, height);
  }

}