import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CryptoUtil } from '../common/security/crypto.util';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

describe('CatalogController owner-only writes', () => {
  const service = {
    updateVariantPrice: jest.fn(),
    updateCategoryTax: jest.fn(),
    updateToppingPrice: jest.fn(),
  };
  const controller = new CatalogController(
    service as unknown as CatalogService,
  );
  const secret =
    process.env.JWT_ACCESS_SECRET ||
    'local-development-access-secret-change-before-deploy';
  const owner = `Bearer ${CryptoUtil.signJwt({ userId: '1', role: 'OWNER' }, secret)}`;
  const manager = `Bearer ${CryptoUtil.signJwt({ userId: '2', role: 'STORE_MANAGER', homeStoreId: '1' }, secret)}`;

  beforeEach(() => jest.clearAllMocks());

  it('rejects manager updates to chain-wide prices and VAT', () => {
    expect(() =>
      controller.updateVariantPrice(manager, '1', { priceVnd: '39000' }),
    ).toThrow(ForbiddenException);
    expect(() =>
      controller.updateCategoryTax(manager, '1', { taxRateBps: 0 }),
    ).toThrow(ForbiddenException);
    expect(() =>
      controller.updateToppingPrice(manager, '1', { priceVnd: '10000' }),
    ).toThrow(ForbiddenException);
    expect(service.updateVariantPrice).not.toHaveBeenCalled();
    expect(service.updateCategoryTax).not.toHaveBeenCalled();
    expect(service.updateToppingPrice).not.toHaveBeenCalled();
  });

  it('accepts Owner and passes validated IDs to service', async () => {
    await controller.updateVariantPrice(owner, '12', { priceVnd: '39000' });
    await controller.updateCategoryTax(owner, '2', { taxRateBps: 0 });
    await controller.updateToppingPrice(owner, '9', { priceVnd: '10000' });
    expect(service.updateVariantPrice).toHaveBeenCalledWith(12n, '39000');
    expect(service.updateCategoryTax).toHaveBeenCalledWith(2n, 0);
    expect(service.updateToppingPrice).toHaveBeenCalledWith(9n, '10000');
  });

  it('rejects malformed IDs before reaching the database', () => {
    expect(() =>
      controller.updateVariantPrice(owner, '0', { priceVnd: '1' }),
    ).toThrow(BadRequestException);
    expect(service.updateVariantPrice).not.toHaveBeenCalled();
  });
});
