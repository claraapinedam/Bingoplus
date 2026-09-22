import { DispatchOrchestratorService } from './dispatch-orchestrator.service';

const tx = {} as any;

describe('DispatchOrchestratorService — progressive radius expansion (plan item 4)', () => {
  let orchestrator: DispatchOrchestratorService;
  let dispatch: any;

  beforeEach(() => {
    dispatch = {
      getConfig: jest.fn().mockResolvedValue({ radiusExpansionKm: [2, 4, 6, 8], maxSearchRadiusKm: 10 }),
      dispatch: jest.fn(),
    };
    orchestrator = new DispatchOrchestratorService(dispatch);
  });

  it('stops at the first radius step that finds a candidate, never trying wider steps', async () => {
    dispatch.dispatch.mockResolvedValueOnce(null).mockResolvedValueOnce('rider-42');

    const result = await orchestrator.dispatch(tx, 'd1', -0.2, -78.5, []);

    expect(result).toBe('rider-42');
    expect(dispatch.dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.dispatch).toHaveBeenNthCalledWith(1, tx, 'd1', -0.2, -78.5, [], 2);
    expect(dispatch.dispatch).toHaveBeenNthCalledWith(2, tx, 'd1', -0.2, -78.5, [], 4);
  });

  it('exhausts every configured radius step and returns null (delivery stays SEARCHING_RIDER) when none find a candidate', async () => {
    dispatch.dispatch.mockResolvedValue(null);

    const result = await orchestrator.dispatch(tx, 'd1', -0.2, -78.5, ['excluded-rider']);

    expect(result).toBeNull();
    expect(dispatch.dispatch).toHaveBeenCalledTimes(4);
    expect(dispatch.dispatch).toHaveBeenNthCalledWith(4, tx, 'd1', -0.2, -78.5, ['excluded-rider'], 8);
  });

  it('falls back to a single step at maxSearchRadiusKm when radiusExpansionKm is empty', async () => {
    dispatch.getConfig.mockResolvedValue({ radiusExpansionKm: [], maxSearchRadiusKm: 12 });
    dispatch.dispatch.mockResolvedValue('rider-1');

    const result = await orchestrator.dispatch(tx, 'd1', -0.2, -78.5, []);

    expect(result).toBe('rider-1');
    expect(dispatch.dispatch).toHaveBeenCalledWith(tx, 'd1', -0.2, -78.5, [], 12);
  });
});
