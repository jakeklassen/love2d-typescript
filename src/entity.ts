type Vector2 = {
  x: number;
  y: number;
};

type Sprite = {
  frame: {
    sourceX: number;
    sourceY: number;
    width: number;
    height: number;
  };
};

export type Entity = {
  direction?: Vector2;
  position?: Vector2;
  sprite?: Sprite;
  tagPlayer?: boolean;
  velocity?: Vector2;
};
