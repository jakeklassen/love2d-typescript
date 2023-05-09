import { Animation } from './animation';

export class Animator {
  private animations: { [key: string]: Animation } = {};
  private currentAnimation: Animation | null = null;

  public addAnimation(name: string, animation: Animation) {
    this.animations[name] = animation;
  }

  public removeAnimation(name: string) {
    delete this.animations[name];
  }

  public getCurrentAnimation() {
    return this.currentAnimation;
  }

  public play(name: string) {
    if (this.animations[name] == null) {
      error(`animation '${name}' not found`);
    } else {
      this.currentAnimation = this.animations[name];
      this.currentAnimation.play();
    }
  }

  public stop() {
    if (this.currentAnimation == null) {
      return;
    }

    this.currentAnimation.stop();
    this.currentAnimation = null;
  }

  public update(dt: number) {
    if (this.currentAnimation != null) {
      this.currentAnimation.update(dt);
    }
  }
}
