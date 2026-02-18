import { Module } from "@nestjs/common";
import { CategoryStrategyFactory } from "./category-strategy.factory";

@Module({
  providers: [CategoryStrategyFactory],
  exports: [CategoryStrategyFactory],
})
export class CategoriesModule {}
